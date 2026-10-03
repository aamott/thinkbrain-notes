import { afterEach, describe, expect, it, vi } from "vitest";

const { invokeNativeCommand } = vi.hoisted(() => ({ invokeNativeCommand: vi.fn() }));

vi.mock("../native/commands", () => ({ invokeNativeCommand }));
// The event seam is only imported by the module under test; nothing here
// subscribes, so it answers as a no-op.
vi.mock("./syncEvents", () => ({ subscribeToSyncEvent: vi.fn() }));

const { readHistory } = await import("./syncService");

afterEach(() => {
  invokeNativeCommand.mockReset();
});

/**
 * `readHistory` is a thin adapter: the test is that the page contract crosses
 * the native boundary unchanged — cursor going in, `{changes, nextCursor}`
 * coming out — because the panel's staleness guards all hinge on it.
 */
describe("reading the recorded history", () => {
  it("asks for a first page with the default limit and no cursor", async () => {
    const page = { changes: [], nextCursor: null };
    invokeNativeCommand.mockResolvedValueOnce(page);

    await expect(readHistory("/notes", "Roadmap.md")).resolves.toBe(page);
    expect(invokeNativeCommand).toHaveBeenCalledWith("sync_history", {
      rootPath: "/notes",
      notePath: "Roadmap.md",
      limit: 60,
      cursor: null
    });
  });

  it("forwards an explicit cursor when continuing into older history", async () => {
    invokeNativeCommand.mockResolvedValueOnce({ changes: [], nextCursor: "c2" });

    await expect(readHistory("/notes", null, 25, "cursor-1")).resolves.toEqual({
      changes: [],
      nextCursor: "c2"
    });
    expect(invokeNativeCommand).toHaveBeenCalledWith("sync_history", {
      rootPath: "/notes",
      notePath: null,
      limit: 25,
      cursor: "cursor-1"
    });
  });

  /// An invalid or expired cursor is the backend's actionable failure — it
  /// must reach the caller as it arrived, not be swallowed into an empty page.
  it("lets a native failure reach the caller untouched", async () => {
    const failure = new Error("cursor expired");
    invokeNativeCommand.mockRejectedValueOnce(failure);

    await expect(readHistory("/notes", "Roadmap.md", 60, "stale-cursor")).rejects.toBe(failure);
  });
});
