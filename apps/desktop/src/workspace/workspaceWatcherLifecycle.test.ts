import { beforeEach, describe, expect, it, vi } from "vitest";

import { appEvents } from "../events/appEvents";

const listen = vi.fn();
const invokeNativeCommand = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({ listen: (...args: unknown[]) => listen(...args) }));
vi.mock("../native/commands", () => ({
  invokeNativeCommand: (...args: unknown[]) => invokeNativeCommand(...args)
}));

const { watchWorkspace } = await import("./workspaceWatcher");

/** Captures the handler the watcher registers so tests can drive it. */
type Handler = (event: { payload: unknown }) => void;

const unlisten = vi.fn();
let handler: Handler = () => undefined;

beforeEach(() => {
  listen.mockReset();
  invokeNativeCommand.mockReset();
  unlisten.mockReset();
  listen.mockImplementation((_event: string, given: Handler) => {
    handler = given;
    return Promise.resolve(unlisten);
  });
});

describe("the workspace watcher's lifecycle", () => {
  it("asks the platform to watch the folder the caller named", async () => {
    invokeNativeCommand.mockResolvedValue("/vault");

    await watchWorkspace("/vault", vi.fn());

    expect(invokeNativeCommand).toHaveBeenCalledWith("watch_workspace", { rootPath: "/vault" });
  });

  /**
   * The native side canonicalizes the root, so a vault reached through a
   * symlink is reported under a different string than the caller passed.
   * Filtering on the caller's spelling would drop every event it was sent.
   */
  it("recognises its own events when the canonical root differs from the caller's", async () => {
    invokeNativeCommand.mockResolvedValue("/real/vault");
    const seen: unknown[] = [];
    const subscription = appEvents.on("note.saved", (payload) => seen.push(payload));

    await watchWorkspace("/link/vault", vi.fn());
    handler({
      payload: { rootPath: "/real/vault", changes: [{ kind: "modified", path: "a.md" }] }
    });

    // Heard, and re-announced under the root the stores are keyed by.
    expect(seen).toEqual([
      { rootPath: "/link/vault", relativePath: "a.md", origin: "external" }
    ]);
    void subscription.dispose();
  });

  it("ignores another window's workspace", async () => {
    invokeNativeCommand.mockResolvedValue("/vault");
    const seen: unknown[] = [];
    const subscription = appEvents.on("note.saved", (payload) => seen.push(payload));

    await watchWorkspace("/vault", vi.fn());
    handler({
      payload: { rootPath: "/other-vault", changes: [{ kind: "modified", path: "a.md" }] }
    });

    expect(seen).toEqual([]);
    void subscription.dispose();
  });

  it("stops listening and releases the native watcher when told to stop", async () => {
    invokeNativeCommand.mockResolvedValue("/vault");

    const stop = await watchWorkspace("/vault", vi.fn());
    invokeNativeCommand.mockClear();
    stop();

    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(invokeNativeCommand).toHaveBeenCalledWith("unwatch_workspace", { canonicalRoot: "/vault" });
  });

  it("reports a rescan to the caller so it can rebuild from disk", async () => {
    invokeNativeCommand.mockResolvedValue("/vault");
    const onRescan = vi.fn();

    await watchWorkspace("/vault", onRescan);
    handler({ payload: { rootPath: "/vault", changes: [{ kind: "rescan", path: "" }] } });

    expect(onRescan).toHaveBeenCalledTimes(1);
  });
});
