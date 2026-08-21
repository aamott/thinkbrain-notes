// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetNotificationStore, useNotificationStore } from "../notifications/notificationStore";
import { NOT_RECORDING, type SyncStatus } from "../sync/historyTypes";
import { StatusBar } from "./StatusBar";

let onSetupSuccess: (() => void) | null = null;

// The adapter subscribes to setup success; mocking the sync service keeps the
// test from needing the Tauri event bridge and lets us fire the event by hand.
vi.mock("../sync/syncService", () => ({
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
  vi.unstubAllGlobals();
});

async function renderBar(
  syncStatus?: SyncStatus,
  onOpenSyncPanel?: (panel: "conflicts" | "history") => void,
  onOpenSettings?: () => void
) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <StatusBar
        workspaceName="Notes"
        syncStatus={syncStatus}
        onOpenSyncPanel={onOpenSyncPanel}
        onOpenSettings={onOpenSettings}
      />
    );
  });
  return host;
}

async function renderProblem(
  onOpenSyncPanel?: (panel: "conflicts" | "history") => void,
  onOpenSettings?: () => void
) {
  return renderBar(
    {
      ...NOT_RECORDING,
      state: "problem",
      problem: {
        code: "sync.auth_required",
        message: "This git link needs a sign-in.",
        details: "TLS certificate verification failed."
      }
    },
    onOpenSyncPanel,
    onOpenSettings
  );
}

function findButton(rendered: ParentNode, label: string): HTMLButtonElement | undefined {
  return Array.from(rendered.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === label
  );
}

describe("sync failure notifications", () => {
  it("shows a sync failure immediately with its recovery action", async () => {
    const rendered = await renderProblem();

    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain("Sync needs attention");
    expect(rendered.textContent).toContain("This git link needs a sign-in.");
    expect(rendered.textContent).toContain("Open saved versions");
    expect(rendered.textContent).toContain("Technical details");
  });

  it("routes an ordinary sync problem to saved versions", async () => {
    const onOpenSyncPanel = vi.fn();
    const onOpenSettings = vi.fn();
    const rendered = await renderProblem(onOpenSyncPanel, onOpenSettings);

    await act(async () => findButton(rendered, "Open saved versions")?.click());

    expect(onOpenSyncPanel).toHaveBeenCalledWith("history");
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("keeps the same failure behind the notifications bell", async () => {
    const onOpenSyncPanel = vi.fn();
    const onOpenSettings = vi.fn();
    const rendered = await renderProblem(onOpenSyncPanel, onOpenSettings);
    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');
    await act(async () => bell?.click());

    const dialog = rendered.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Sync needs attention");
    expect(dialog?.textContent).toContain("This git link needs a sign-in.");

    await act(async () => findButton(dialog!, "Open saved versions")?.click());

    expect(onOpenSyncPanel).toHaveBeenCalledWith("history");
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("shows a badge dot on the bell when there is an unread notification", async () => {
    const rendered = await renderProblem();
    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');
    // The badge dot is a span inside the bell button.
    expect(bell?.querySelector("span")?.className).toContain("bg-danger");
  });

  it("does not show a badge dot when there are no notifications", async () => {
    const rendered = await renderBar();
    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');
    expect(bell?.querySelector("span.bg-danger")).toBeNull();
  });
});

describe("git link setup success", () => {
  it("toasts after setup and appears in the bell log while undismissed", async () => {
    const rendered = await renderBar();
    await act(async () => onSetupSuccess?.());

    expect(rendered.querySelector('[role="status"]')?.textContent).toContain("Git link is ready");
    expect(rendered.querySelector('[role="status"]')?.textContent).toContain(
      "Notes can now stay in step with this git link."
    );
    expect(rendered.querySelector('[role="alert"]')).toBeNull();

    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');
    await act(async () => bell?.click());
    // The success notification is transient (not silent), so it is both the
    // active toast and an undismissed entry in the bell log.
    expect(rendered.querySelector('[role="dialog"]')?.textContent).toContain("Git link is ready");
  });

  it("does not show a success toast while a problem is present", async () => {
    const rendered = await renderProblem();
    await act(async () => onSetupSuccess?.());

    // The sticky problem wins the toast slot.
    expect(rendered.querySelector('[role="status"]')).toBeNull();
    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain("Sync needs attention");
  });
});

describe("undo history maintenance notifications", () => {
  it("toasts a tidy failure without claiming sync stopped", async () => {
    const onOpenSyncPanel = vi.fn();
    const onOpenSettings = vi.fn();
    const rendered = await renderBar(
      {
        ...NOT_RECORDING,
        state: "idle",
        maintenanceProblem: {
          code: "sync.history_cleanup_failed",
          message: "Could not tidy the saved undo history on this computer."
        }
      },
      onOpenSyncPanel,
      onOpenSettings
    );

    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain("Could not free space");
    expect(rendered.textContent).toContain("Open Settings");
    expect(rendered.querySelector('[role="alert"]')?.textContent).not.toContain("Sync needs attention");

    await act(async () => findButton(rendered, "Open Settings")?.click());

    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onOpenSyncPanel).not.toHaveBeenCalled();
  });

  it("routes the maintenance notification to Settings with the matching title", async () => {
    const onOpenSyncPanel = vi.fn();
    const onOpenSettings = vi.fn();
    const rendered = await renderBar(
      {
        ...NOT_RECORDING,
        state: "idle",
        maintenanceProblem: {
          code: "sync.history_cleanup_failed",
          message: "Could not tidy the saved undo history on this computer."
        }
      },
      onOpenSyncPanel,
      onOpenSettings
    );
    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');

    await act(async () => bell?.click());

    const dialog = rendered.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Could not free space");
    expect(dialog?.textContent).not.toContain("Sync needs attention");

    await act(async () => findButton(dialog!, "Open Settings")?.click());

    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onOpenSyncPanel).not.toHaveBeenCalled();
  });

  it("copies the maintenance title with the rest of the problem report", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const rendered = await renderBar({
      ...NOT_RECORDING,
      state: "idle",
      maintenanceProblem: {
        code: "sync.history_cleanup_failed",
        message: "Could not tidy the saved undo history on this computer."
      }
    });

    await act(async () => findButton(rendered, "Copy")?.click());

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Could not free space\nCould not tidy the saved undo history")
    );
    expect(writeText.mock.calls[0]?.[0]).not.toContain("Sync needs attention");
  });
});

describe("bell log", () => {
  it("lists notifications newest-first with Clear all", async () => {
    const rendered = await renderProblem();
    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');
    await act(async () => bell?.click());

    const dialog = rendered.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Clear all");

    await act(async () => findButton(dialog!, "Clear all")?.click());
    // After clear all, the log is empty and the toast is gone.
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(rendered.querySelector('[role="alert"]')).toBeNull();
  });

  it("Dismiss in the toast clears the toast", async () => {
    const rendered = await renderProblem();
    await act(async () => findButton(rendered, "Dismiss")?.click());
    expect(rendered.querySelector('[role="alert"]')).toBeNull();
    // The entry is dismissed, not removed — it stays out of the bell log.
    expect(useNotificationStore.getState().notifications[0]?.dismissed).toBe(true);
  });

  it("Dismiss in a bell row removes it from the visible log", async () => {
    const rendered = await renderProblem();
    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');
    await act(async () => bell?.click());

    const dialog = rendered.querySelector('[role="dialog"]');
    await act(async () => findButton(dialog!, "Dismiss")?.click());

    // The row is dismissed; the log now shows "No notifications".
    expect(dialog?.textContent).toContain("No notifications");
  });
});
