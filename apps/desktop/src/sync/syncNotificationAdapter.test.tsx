// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetNotificationStore, useNotificationStore } from "../notifications/notificationStore";
import {
  problemToNotification,
  STICKY_SYNC_CODES,
  useSyncNotificationAdapter,
  SYNC_SOURCE
} from "./syncNotificationAdapter";
import { NOT_RECORDING, type SyncStatus } from "./historyTypes";

let onSetupSuccess: (() => void) | null = null;

vi.mock("./syncService", () => ({
  subscribeToSetupSuccess: (onChange: () => void) => {
    onSetupSuccess = onChange;
    return Promise.resolve(() => {
      onSetupSuccess = null;
    });
  }
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  onSetupSuccess = null;
  resetNotificationStore();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** Mounts a tiny component that runs the adapter hook. */
async function mountAdapter(
  syncStatus: SyncStatus,
  onOpenSyncPanel: (panel: "conflicts" | "history") => void = vi.fn(),
  onOpenSettings: () => void = vi.fn()
): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <AdapterHost
        syncStatus={syncStatus}
        onOpenSyncPanel={onOpenSyncPanel}
        onOpenSettings={onOpenSettings}
      />
    );
  });
}

function AdapterHost({
  syncStatus,
  onOpenSyncPanel,
  onOpenSettings
}: {
  syncStatus: SyncStatus;
  onOpenSyncPanel: (panel: "conflicts" | "history") => void;
  onOpenSettings: () => void;
}) {
  useSyncNotificationAdapter({ syncStatus, onOpenSyncPanel, onOpenSettings });
  return null;
}

describe("STICKY_SYNC_CODES", () => {
  it("includes the codes from the plan", () => {
    expect(STICKY_SYNC_CODES.has("sync.auth_required")).toBe(true);
    expect(STICKY_SYNC_CODES.has("sync.credentials_invalid")).toBe(true);
    expect(STICKY_SYNC_CODES.has("sync.remote_not_found")).toBe(true);
    expect(STICKY_SYNC_CODES.has("sync.vault_too_deep")).toBe(true);
    expect(STICKY_SYNC_CODES.has("sync.vault_too_many_entries")).toBe(true);
  });

  it("excludes transient codes", () => {
    expect(STICKY_SYNC_CODES.has("sync.history_cleanup_failed")).toBe(false);
    expect(STICKY_SYNC_CODES.has("sync.remote_unreachable")).toBe(false);
  });
});

describe("problemToNotification", () => {
  it("maps an ordinary sticky problem to a sticky error with the saved-versions action", () => {
    const openSyncPanel = vi.fn();
    const openSettings = vi.fn();
    const input = problemToNotification(
      { code: "sync.auth_required", message: "needs sign-in" },
      openSyncPanel,
      openSettings
    );

    expect(input.source).toBe(SYNC_SOURCE);
    expect(input.severity).toBe("sticky");
    expect(input.variant).toBe("error");
    expect(input.title).toBe("Sync needs attention");
    expect(input.message).toBe("needs sign-in");
    expect(input.action?.label).toBe("Open saved versions");
    expect(input.dedupKey).toBe("sync:sync.auth_required");
  });

  it("maps a transient problem to severity transient", () => {
    const input = problemToNotification(
      { code: "sync.remote_unreachable", message: "offline" },
      vi.fn(),
      vi.fn()
    );
    expect(input.severity).toBe("transient");
  });

  it("routes maintenance failures to Settings with the matching title", () => {
    const openSettings = vi.fn();
    const input = problemToNotification(
      { code: "sync.history_cleanup_failed", message: "could not tidy" },
      vi.fn(),
      openSettings
    );

    expect(input.title).toBe("Could not free space");
    expect(input.action?.label).toBe("Open Settings");
    expect(input.severity).toBe("transient");
  });

  it("carries recovery text and details", () => {
    const input = problemToNotification(
      {
        code: "sync.auth_required",
        message: "needs sign-in",
        details: "TLS handshake failed"
      },
      vi.fn(),
      vi.fn()
    );
    expect(input.recovery).toBeTruthy();
    expect(input.details).toBe("TLS handshake failed");
  });
});

describe("useSyncNotificationAdapter", () => {
  it("pushes a notification when syncStatus has a problem", async () => {
    await mountAdapter({
      ...NOT_RECORDING,
      state: "problem",
      problem: { code: "sync.auth_required", message: "needs sign-in" }
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.source).toBe(SYNC_SOURCE);
    expect(state.activeToast?.severity).toBe("sticky");
  });

  it("prefers problem over maintenanceProblem", async () => {
    await mountAdapter({
      ...NOT_RECORDING,
      state: "problem",
      problem: { code: "sync.auth_required", message: "primary" },
      maintenanceProblem: { code: "sync.history_cleanup_failed", message: "secondary" }
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.message).toBe("primary");
  });

  it("uses maintenanceProblem when there is no problem", async () => {
    await mountAdapter({
      ...NOT_RECORDING,
      state: "idle",
      maintenanceProblem: { code: "sync.history_cleanup_failed", message: "tidy failed" }
    });

    const state = useNotificationStore.getState();
    expect(state.notifications[0]?.title).toBe("Could not free space");
  });

  it("clears sync notifications when the status has no problem", async () => {
    await mountAdapter({
      ...NOT_RECORDING,
      state: "problem",
      problem: { code: "sync.auth_required", message: "needs sign-in" }
    });
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    // Re-mount with a clean status.
    await act(async () => root?.unmount());
    root = null;
    await mountAdapter({ ...NOT_RECORDING, state: "idle" });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(useNotificationStore.getState().activeToast).toBeNull();
  });

  it("does not clear notifications from other sources", async () => {
    useNotificationStore.getState().addNotification({
      source: "extension:x",
      dedupKey: "ext:1",
      title: "Hello",
      message: "world",
      severity: "transient"
    });
    await mountAdapter({
      ...NOT_RECORDING,
      state: "problem",
      problem: { code: "sync.auth_required", message: "needs sign-in" }
    });
    expect(useNotificationStore.getState().notifications).toHaveLength(2);

    await act(async () => root?.unmount());
    root = null;
    await mountAdapter({ ...NOT_RECORDING, state: "idle" });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.source).toBe("extension:x");
  });

  it("dedupes: re-pushing the same problem updates in place", async () => {
    await mountAdapter({
      ...NOT_RECORDING,
      state: "problem",
      problem: { code: "sync.auth_required", message: "first" }
    });
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    await act(async () => root?.unmount());
    root = null;
    await mountAdapter({
      ...NOT_RECORDING,
      state: "problem",
      problem: { code: "sync.auth_required", message: "second" }
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.message).toBe("second");
  });

  it("pushes a transient success notification on setup success", async () => {
    await mountAdapter({ ...NOT_RECORDING, state: "idle" });
    await act(async () => onSetupSuccess?.());

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.title).toBe("Git link is ready");
    expect(state.notifications[0]?.severity).toBe("transient");
    expect(state.notifications[0]?.variant).toBe("success");
    expect(state.notifications[0]?.source).toBe("sync-setup");
    expect(state.activeToast?.title).toBe("Git link is ready");
  });

  it("unsubscribes from setup success on unmount", async () => {
    await mountAdapter({ ...NOT_RECORDING, state: "idle" });
    await act(async () => root?.unmount());
    root = null;
    expect(onSetupSuccess).toBeNull();
  });

  it("setup-success survives a clean status refresh (the credential-save race)", async () => {
    // Simulate the real sequence: save credentials → setup event fires →
    // status refresh shows no problem → clearBySource("sync") must NOT wipe
    // the success toast, which has source "sync-setup".
    await mountAdapter({ ...NOT_RECORDING, state: "idle" });
    await act(async () => onSetupSuccess?.());
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    // Re-mount with a still-clean status (the status refresh after save).
    await act(async () => root?.unmount());
    root = null;
    await mountAdapter({ ...NOT_RECORDING, state: "idle" });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.title).toBe("Git link is ready");
    expect(state.activeToast?.title).toBe("Git link is ready");
  });
});
