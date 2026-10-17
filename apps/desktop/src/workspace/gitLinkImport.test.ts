import { beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeToNativeEvent } from "../native/events";

import { subscribeToWorkspaceImport } from "./gitLinkImport";

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

describe("subscribeToWorkspaceImport", () => {
  it("subscribes to sync://import and forwards the payload callback unchanged", async () => {
    const onEvent = vi.fn();
    const stop = await subscribeToWorkspaceImport(onEvent);

    expect(subscribe).toHaveBeenCalledWith("sync://import", onEvent);

    const payload = { requestId: "imp-1", state: "ok", targetPath: "/vault" };
    subscribe.mock.calls[0]![1](payload);
    expect(onEvent).toHaveBeenCalledWith(payload);

    expect(stop).toBe(unlisten);
  });

  it("propagates a rejected registration unchanged", async () => {
    const failure = new Error("no channel");
    subscribe.mockRejectedValue(failure);

    await expect(subscribeToWorkspaceImport(vi.fn())).rejects.toBe(failure);
  });
});
