// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetNotificationStore, useNotificationStore } from "../notifications/notificationStore";
import { NOT_RECORDING, type SyncStatus } from "./historyTypes";
import { SETTLE_SOURCE, useSettleNotificationAdapter } from "./settleNotificationAdapter";

// Mock readConflictRate so the test controls the settled count.
const readConflictRate = vi.fn<(rootPath: string) => Promise<{ decisions: number; settled: number; recorded: number }>>();

vi.mock("./syncService", () => ({
  readConflictRate: (rootPath: string) => readConflictRate(rootPath)
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  readConflictRate.mockReset();
  resetNotificationStore();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mountAdapter(rootPath: string | null, syncStatus: SyncStatus = NOT_RECORDING): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<AdapterHost rootPath={rootPath} syncStatus={syncStatus} />);
  });
}

function AdapterHost({
  rootPath,
  syncStatus
}: {
  rootPath: string | null;
  syncStatus: SyncStatus;
}) {
  useSettleNotificationAdapter({ rootPath, syncStatus });
  return null;
}

/** Re-renders with new props to simulate a sync status change. */
async function rerender(syncStatus: SyncStatus): Promise<void> {
  await act(async () => {
    root?.render(<AdapterHost rootPath="/notes" syncStatus={syncStatus} />);
  });
}

describe("useSettleNotificationAdapter", () => {
  it("does not notify on the initial read (establishes a baseline)", async () => {
    readConflictRate.mockResolvedValue({ decisions: 0, settled: 5, recorded: 10 });
    await mountAdapter("/notes");

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("notifies when the settled count increases", async () => {
    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 3, recorded: 10 });
    await mountAdapter("/notes");
    expect(useNotificationStore.getState().notifications).toHaveLength(0);

    // Simulate a sync status change → re-read → settled count went up.
    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 8, recorded: 15 });
    await rerender({ ...NOT_RECORDING, state: "syncing" });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.source).toBe(SETTLE_SOURCE);
    expect(state.notifications[0]?.severity).toBe("transient");
    expect(state.notifications[0]?.variant).toBe("info");
    expect(state.notifications[0]?.title).toBe("Duplicate files merged");
    expect(state.notifications[0]?.message).toContain("5 duplicate files were merged");
    expect(state.activeToast?.title).toBe("Duplicate files merged");
  });

  it("uses singular copy for exactly one newly settled conflict", async () => {
    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 0, recorded: 0 });
    await mountAdapter("/notes");

    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 1, recorded: 1 });
    await rerender({ ...NOT_RECORDING, state: "syncing" });

    expect(useNotificationStore.getState().notifications[0]?.message).toContain(
      "1 duplicate file was merged"
    );
  });

  it("does not notify when the settled count stays the same", async () => {
    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 5, recorded: 10 });
    await mountAdapter("/notes");

    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 5, recorded: 10 });
    await rerender({ ...NOT_RECORDING, state: "syncing" });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("does not notify when the settled count decreases (history pruning)", async () => {
    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 10, recorded: 20 });
    await mountAdapter("/notes");

    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 3, recorded: 15 });
    await rerender({ ...NOT_RECORDING, state: "syncing" });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("does nothing when rootPath is null", async () => {
    await mountAdapter(null);
    expect(readConflictRate).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("dedupes: a second increase updates the same notification in place", async () => {
    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 0, recorded: 0 });
    await mountAdapter("/notes");

    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 2, recorded: 5 });
    await rerender({ ...NOT_RECORDING, state: "syncing" });
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 5, recorded: 8 });
    await rerender({ ...NOT_RECORDING, state: "syncing" });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.message).toContain("3 duplicate files were merged");
  });

  it("survives a failed rate read without notifying", async () => {
    readConflictRate.mockResolvedValueOnce({ decisions: 0, settled: 0, recorded: 0 });
    await mountAdapter("/notes");

    readConflictRate.mockRejectedValueOnce(new Error("network down"));
    await rerender({ ...NOT_RECORDING, state: "syncing" });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
