// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetNotificationStore, useNotificationStore } from "../notifications/notificationStore";
import { CONFLICT_SOURCE, useConflictNotificationAdapter } from "./conflictNotificationAdapter";
import type { ConflictSummary } from "./conflictTypes";
import { NOT_RECORDING, type SyncStatus } from "./historyTypes";

// Mock listConflicts so the test controls which conflicts are outstanding.
const listConflicts = vi.fn<(rootPath: string) => Promise<readonly ConflictSummary[]>>();

vi.mock("./conflictService", () => ({
  listConflicts: (rootPath: string) => listConflicts(rootPath)
}));

/** A conflict keyed by its copy path — the handle the native side uses. */
function conflict(copyPath: string): ConflictSummary {
  return {
    kind: "text",
    decision: "versions",
    ours: {
      path: copyPath.replace(/ \(.*\)/, ""),
      label: "This computer",
      byteSize: 10,
      changedAt: 1,
      fingerprint: "a"
    },
    theirs: {
      path: copyPath,
      label: "Syncthing",
      byteSize: 12,
      changedAt: 2,
      fingerprint: "b"
    }
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const onReview = vi.fn<(panel: "conflicts" | "history") => void>();

beforeEach(() => {
  listConflicts.mockReset();
  onReview.mockReset();
  resetNotificationStore();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function AdapterHost({
  rootPath,
  syncStatus
}: {
  rootPath: string | null;
  syncStatus: SyncStatus;
}) {
  useConflictNotificationAdapter({ rootPath, syncStatus, onReview });
  return null;
}

async function mountAdapter(
  rootPath: string | null,
  syncStatus: SyncStatus = NOT_RECORDING
): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<AdapterHost rootPath={rootPath} syncStatus={syncStatus} />);
  });
}

/** Re-renders with a changed status to trigger a re-read. */
async function rerender(syncStatus: SyncStatus): Promise<void> {
  await act(async () => {
    root?.render(<AdapterHost rootPath="/notes" syncStatus={syncStatus} />);
  });
}

describe("useConflictNotificationAdapter", () => {
  it("announces conflicts found by the first read", async () => {
    // Unlike the settle counter, the first read is current unresolved state:
    // the startup scan's findings are actionable now.
    listConflicts.mockResolvedValue([conflict("note (Syncthing).md")]);
    await mountAdapter("/notes");

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.source).toBe(CONFLICT_SOURCE);
    expect(state.notifications[0]?.severity).toBe("transient");
    expect(state.notifications[0]?.variant).toBe("warning");
    expect(state.notifications[0]?.title).toBe("Two versions found");
    expect(state.notifications[0]?.message).toContain("1 note has two versions");
    expect(state.activeToast?.title).toBe("Two versions found");
  });

  it("stays silent when the first read finds nothing", async () => {
    listConflicts.mockResolvedValue([]);
    await mountAdapter("/notes");

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("uses plural copy for more than one conflict", async () => {
    listConflicts.mockResolvedValue([conflict("a (Syncthing).md"), conflict("b (Syncthing).md")]);
    await mountAdapter("/notes");

    expect(useNotificationStore.getState().notifications[0]?.message).toContain(
      "2 notes have two versions"
    );
  });

  it("announces only the conflicts that are new since the last read", async () => {
    listConflicts.mockResolvedValueOnce([conflict("a (Syncthing).md")]);
    await mountAdapter("/notes");

    listConflicts.mockResolvedValueOnce([
      conflict("a (Syncthing).md"),
      conflict("b (Syncthing).md"),
      conflict("c (Syncthing).md")
    ]);
    await rerender({ ...NOT_RECORDING, state: "syncing" });

    // Two arrived; the one already announced is not counted again.
    expect(useNotificationStore.getState().notifications[0]?.message).toContain(
      "2 notes have two versions"
    );
  });

  it("announces a new conflict even when the total count is unchanged", async () => {
    // The case a count-watcher misses: one resolved, one arrived, still 2.
    listConflicts.mockResolvedValueOnce([conflict("a (Syncthing).md"), conflict("b (Syncthing).md")]);
    await mountAdapter("/notes");
    expect(useNotificationStore.getState().notifications[0]?.message).toContain(
      "2 notes have two versions"
    );

    listConflicts.mockResolvedValueOnce([conflict("b (Syncthing).md"), conflict("c (Syncthing).md")]);
    await rerender({ ...NOT_RECORDING, state: "syncing" });

    expect(useNotificationStore.getState().notifications[0]?.message).toContain(
      "1 note has two versions"
    );
  });

  it("stays silent when conflicts are only resolved", async () => {
    listConflicts.mockResolvedValueOnce([conflict("a (Syncthing).md"), conflict("b (Syncthing).md")]);
    await mountAdapter("/notes");
    resetNotificationStore();

    listConflicts.mockResolvedValueOnce([conflict("a (Syncthing).md")]);
    await rerender({ ...NOT_RECORDING, state: "syncing" });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("re-announces a conflict that comes back after being resolved", async () => {
    listConflicts.mockResolvedValueOnce([conflict("a (Syncthing).md")]);
    await mountAdapter("/notes");

    listConflicts.mockResolvedValueOnce([]);
    await rerender({ ...NOT_RECORDING, state: "syncing" });
    resetNotificationStore();

    listConflicts.mockResolvedValueOnce([conflict("a (Syncthing).md")]);
    await rerender({ ...NOT_RECORDING, state: "idle" });

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it("dedupes: a later arrival updates the same notification in place", async () => {
    listConflicts.mockResolvedValueOnce([conflict("a (Syncthing).md")]);
    await mountAdapter("/notes");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    listConflicts.mockResolvedValueOnce([conflict("a (Syncthing).md"), conflict("b (Syncthing).md")]);
    await rerender({ ...NOT_RECORDING, state: "syncing" });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.message).toContain("1 note has two versions");
  });

  it("offers a review action that opens the conflicts panel", async () => {
    listConflicts.mockResolvedValue([conflict("a (Syncthing).md")]);
    await mountAdapter("/notes");

    const action = useNotificationStore.getState().notifications[0]?.action;
    expect(action?.label).toBe("Review");
    action?.onClick();
    expect(onReview).toHaveBeenCalledWith("conflicts");
  });

  it("does nothing when rootPath is null", async () => {
    await mountAdapter(null);

    expect(listConflicts).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("survives a failed read without notifying", async () => {
    listConflicts.mockRejectedValueOnce(new Error("vault unreadable"));
    await mountAdapter("/notes");

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
