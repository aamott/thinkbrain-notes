import { beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeToNativeEvent } from "../native/events";

import { subscribeToSyncEvent } from "./syncEvents";

vi.mock("../native/events", () => ({
  subscribeToNativeEvent: vi.fn()
}));

const subscribe = vi.mocked(subscribeToNativeEvent);
const unlisten = vi.fn();

beforeEach(() => {
  subscribe.mockReset();
  unlisten.mockReset();
  subscribe.mockResolvedValue(unlisten);
});

describe("subscribeToSyncEvent", () => {
  it.each(["sync://status", "sync://setup", "sync://conflicts"] as const)(
    "forwards %s to the native event seam and calls onChange without filtering",
    async (event) => {
      const onChange = vi.fn();
      const stop = await subscribeToSyncEvent(event, onChange);

      expect(subscribe).toHaveBeenCalledWith(event, expect.any(Function));

      // The seam's wrapped callback fires whatever payload arrived — the
      // workspace name is deliberately never compared here (see the module
      // doc): even another workspace's event prompts a cheap re-read.
      const wrapped = subscribe.mock.calls[0]![1];
      wrapped({ rootPath: "/other-vault" });
      expect(onChange).toHaveBeenCalledTimes(1);

      stop();
      expect(unlisten).toHaveBeenCalledTimes(1);
    }
  );

  it("does not swallow a rejected registration", async () => {
    const failure = new Error("no channel");
    subscribe.mockRejectedValue(failure);

    await expect(subscribeToSyncEvent("sync://status", vi.fn())).rejects.toBe(failure);
  });
});
