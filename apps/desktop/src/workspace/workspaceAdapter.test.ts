import { describe, expect, it, vi } from "vitest";

vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn(async () => ({
    workspace: { root_path: "/vault", name: "vault" },
    files: []
  }))
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { invokeNativeCommand } from "../native/commands";
import { appEvents } from "../events/appEvents";
import { workspaceDesktopApi } from "./workspaceAdapter";

describe("workspace open events", () => {
  it("emits workspace.opened after the native open succeeds", async () => {
    const opened = vi.fn();
    const subscription = appEvents.on("workspace.opened", opened);

    await workspaceDesktopApi.openWorkspace("/vault");

    expect(opened).toHaveBeenCalledWith({ rootPath: "/vault" });
    subscription.dispose();
  });

  it("emits nothing when the native open fails", async () => {
    vi.mocked(invokeNativeCommand).mockRejectedValueOnce(new Error("gone"));
    const opened = vi.fn();
    const subscription = appEvents.on("workspace.opened", opened);

    await expect(workspaceDesktopApi.openWorkspace("/vault")).rejects.toThrow("gone");

    expect(opened).not.toHaveBeenCalled();
    subscription.dispose();
  });
});
