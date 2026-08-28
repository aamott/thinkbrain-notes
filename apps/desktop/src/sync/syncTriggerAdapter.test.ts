import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeNativeCommand = vi.fn();

vi.mock("../native/commands", () => ({
  invokeNativeCommand: (...args: unknown[]) => invokeNativeCommand(...args)
}));

import { reportVisibility } from "./syncTriggerAdapter";

beforeEach(() => {
  invokeNativeCommand.mockReset();
});

describe("syncTriggerAdapter", () => {
  it("tells the native side when the app comes back", async () => {
    invokeNativeCommand.mockResolvedValue(undefined);
    await reportVisibility("visible");
    expect(invokeNativeCommand).toHaveBeenCalledWith("sync_app_foregrounded");
  });

  it("tells the native side when the app goes away", async () => {
    invokeNativeCommand.mockResolvedValue(undefined);
    await reportVisibility("hidden");
    expect(invokeNativeCommand).toHaveBeenCalledWith("sync_app_backgrounded");
  });

  // A lifecycle event is not a user action; a failure here must never surface
  // as an error the user has to dismiss.
  it("stays quiet when the native side fails", async () => {
    invokeNativeCommand.mockRejectedValue(new Error("no"));
    await expect(reportVisibility("visible")).resolves.toBeUndefined();
  });
});
