import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeNativeCommand = vi.fn();

vi.mock("../native/commands", () => ({
  invokeNativeCommand: (...args: unknown[]) => invokeNativeCommand(...args)
}));

import { reportHidden } from "./syncLifecycleAdapter";

beforeEach(() => {
  invokeNativeCommand.mockReset();
});

describe("syncLifecycleAdapter", () => {
  it("tells the native side when the app goes away", async () => {
    await reportHidden("hidden");
    expect(invokeNativeCommand).toHaveBeenCalledWith("sync_app_backgrounded");
  });

  it("says nothing when the app comes back", async () => {
    await reportHidden("visible");
    expect(invokeNativeCommand).not.toHaveBeenCalled();
  });

  it("does not interrupt the user when the call fails", async () => {
    vi.mocked(invokeNativeCommand).mockRejectedValueOnce(new Error("no"));
    await expect(reportHidden("hidden")).resolves.toBeUndefined();
  });
});
