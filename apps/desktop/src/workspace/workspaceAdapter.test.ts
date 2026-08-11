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

describe("note rename events", () => {
  it("emits note.renamed after a successful rename", async () => {
    const renamed = vi.fn();
    const subscription = appEvents.on("note.renamed", renamed);

    await workspaceDesktopApi.renameWorkspaceEntry("/vault", "old.md", "new.md");

    expect(renamed).toHaveBeenCalledWith({
      rootPath: "/vault",
      oldRelativePath: "old.md",
      newRelativePath: "new.md"
    });
    subscription.dispose();
  });

  it("emits nothing when the native rename fails", async () => {
    vi.mocked(invokeNativeCommand).mockRejectedValueOnce(new Error("gone"));
    const renamed = vi.fn();
    const subscription = appEvents.on("note.renamed", renamed);

    await expect(
      workspaceDesktopApi.renameWorkspaceEntry("/vault", "old.md", "new.md")
    ).rejects.toThrow("gone");

    expect(renamed).not.toHaveBeenCalled();
    subscription.dispose();
  });
});

describe("note delete events", () => {
  it("emits note.deleted after a successful delete", async () => {
    const deleted = vi.fn();
    const subscription = appEvents.on("note.deleted", deleted);

    await workspaceDesktopApi.deleteWorkspaceEntry("/vault", "gone.md");

    expect(deleted).toHaveBeenCalledWith({ rootPath: "/vault", relativePath: "gone.md" });
    subscription.dispose();
  });

  it("emits nothing when the native delete fails", async () => {
    vi.mocked(invokeNativeCommand).mockRejectedValueOnce(new Error("gone"));
    const deleted = vi.fn();
    const subscription = appEvents.on("note.deleted", deleted);

    await expect(
      workspaceDesktopApi.deleteWorkspaceEntry("/vault", "gone.md")
    ).rejects.toThrow("gone");

    expect(deleted).not.toHaveBeenCalled();
    subscription.dispose();
  });
});
