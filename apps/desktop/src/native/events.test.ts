import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { listen } from "@tauri-apps/api/event";

import {
  subscribeToNativeEvent,
  type NativeEventMap,
  type NativeWorkspaceChangedPayload
} from "./events";
import type { NativeImportProgress } from "./commands";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn<(event: string, handler: (envelope: { payload: unknown }) => void) => Promise<() => void>>()
}));

const listenMock = vi.mocked(listen);
const unlisten = vi.fn();

/** The handler `subscribeToNativeEvent` wrapped around `listen`. */
function registeredHandler(): (envelope: { payload: unknown }) => void {
  return listenMock.mock.calls[0]![1] as unknown as (envelope: { payload: unknown }) => void;
}

beforeEach(() => {
  listenMock.mockReset();
  unlisten.mockReset();
  listenMock.mockResolvedValue(unlisten);
});

describe("subscribeToNativeEvent", () => {
  it("subscribes to workspace://changed and forwards the payload, renames included", async () => {
    const onEvent = vi.fn();
    const stop = await subscribeToNativeEvent("workspace://changed", onEvent);
    const payload: NativeWorkspaceChangedPayload = {
      rootPath: "/vault",
      changes: [
        { kind: "renamed", path: "b.md", oldPath: "a.md" },
        { kind: "deleted", path: "c.md" }
      ]
    };

    registeredHandler()({ payload });

    expect(listenMock).toHaveBeenCalledWith("workspace://changed", expect.any(Function));
    expect(onEvent).toHaveBeenCalledWith(payload);
    expect(stop).toBe(unlisten);
  });

  it("subscribes to sync://import and forwards the NativeImportProgress payload", async () => {
    const onEvent = vi.fn();
    await subscribeToNativeEvent("sync://import", onEvent);
    const payload: NativeImportProgress = {
      requestId: "imp-1",
      state: "ok",
      phase: "sending",
      targetPath: "/vault",
      notSent: "no credentials"
    };

    registeredHandler()({ payload });

    expect(listenMock).toHaveBeenCalledWith("sync://import", expect.any(Function));
    expect(onEvent).toHaveBeenCalledWith(payload);
  });

  it.each(["sync://status", "sync://setup", "sync://conflicts"] as const)(
    "subscribes to %s and forwards the named-workspace payload",
    async (event) => {
      const onEvent = vi.fn();
      await subscribeToNativeEvent(event, onEvent);
      const payload = { rootPath: "/vault" };

      registeredHandler()({ payload });

      expect(listenMock).toHaveBeenCalledWith(event, expect.any(Function));
      expect(onEvent).toHaveBeenCalledWith(payload);
    }
  );

  it("returns the unlisten function listen resolves to", async () => {
    const stop = await subscribeToNativeEvent("sync://status", vi.fn());

    stop();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("stays pending until listen resolves the registration", async () => {
    let resolveListen!: (unlisten: () => void) => void;
    listenMock.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      })
    );

    let settled = false;
    const pending = subscribeToNativeEvent("sync://status", vi.fn()).then((stop) => {
      settled = true;
      return stop;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    resolveListen(unlisten);
    expect(await pending).toBe(unlisten);
    expect(settled).toBe(true);
  });

  it("propagates a rejected registration unchanged", async () => {
    const failure = new Error("event registration refused");
    listenMock.mockRejectedValue(failure);

    await expect(subscribeToNativeEvent("sync://status", vi.fn())).rejects.toBe(failure);
  });

  it("maps each event name to its payload type and no other", () => {
    // Never invoked: these assertions exist for `tsc`, which fails the build
    // if the map stops pairing names and payloads correctly.
    const neverInvoked = () => {
      subscribeToNativeEvent("workspace://changed", (payload) => {
        expectTypeOf(payload).toEqualTypeOf<NativeWorkspaceChangedPayload>();
      });
      subscribeToNativeEvent("sync://import", (payload) => {
        expectTypeOf(payload).toEqualTypeOf<NativeImportProgress>();
        expectTypeOf<NativeEventMap["sync://import"]>().toEqualTypeOf<NativeImportProgress>();
      });
      subscribeToNativeEvent("sync://conflicts", (payload) => {
        expectTypeOf(payload).toEqualTypeOf<{ readonly rootPath: string }>();
      });
      // @ts-expect-error — not a native event name.
      subscribeToNativeEvent("sync://nope", () => undefined);
      subscribeToNativeEvent("workspace://changed", (payload) => {
        // @ts-expect-error — the changed payload carries changes, not a requestId.
        void payload.requestId;
      });
      void (0 as unknown as NativeEventMap);
    };
    void neverInvoked;
  });
});
