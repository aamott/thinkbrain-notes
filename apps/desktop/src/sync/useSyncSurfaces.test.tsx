// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetNotificationStore } from "../notifications/notificationStore";
import { NOT_RECORDING, type SyncStatus } from "./historyTypes";
import { useSyncSurfaces, type SyncSurfaces } from "./useSyncSurfaces";

// The surfaces hook composes three hooks that each own their own IO. Only the
// badge derivation is this hook's own logic, so the rest is stubbed out.
const syncStatus = vi.fn<() => SyncStatus>(() => NOT_RECORDING);

vi.mock("./useSyncStatus", () => ({
  useSyncStatus: () => syncStatus()
}));
vi.mock("./settleNotificationAdapter", () => ({
  useSettleNotificationAdapter: vi.fn()
}));
vi.mock("./conflictNotificationAdapter", () => ({
  useConflictNotificationAdapter: vi.fn()
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  syncStatus.mockReturnValue(NOT_RECORDING);
  resetNotificationStore();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** Mounts the hook and hands back what it returned. */
async function mountSurfaces(): Promise<SyncSurfaces> {
  let captured: SyncSurfaces | null = null;
  function Host() {
    captured = useSyncSurfaces({ rootPath: "/notes", onReview: () => {} });
    return null;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Host />);
  });
  if (!captured) throw new Error("hook did not run");
  return captured;
}

describe("useSyncSurfaces", () => {
  it("badges the conflicts panel with the number needing attention", async () => {
    syncStatus.mockReturnValue({ ...NOT_RECORDING, attention: 3 });

    const surfaces = await mountSurfaces();

    expect(surfaces.conflictBadges).toEqual({ conflicts: 3 });
  });

  it("carries no badge when nothing needs attention", async () => {
    syncStatus.mockReturnValue({ ...NOT_RECORDING, attention: 0 });

    const surfaces = await mountSurfaces();

    expect(surfaces.conflictBadges).toEqual({});
  });

  it("passes the sync status straight through", async () => {
    const status = { ...NOT_RECORDING, state: "syncing" as const, waiting: 2 };
    syncStatus.mockReturnValue(status);

    const surfaces = await mountSurfaces();

    expect(surfaces.syncStatus).toBe(status);
  });
});
