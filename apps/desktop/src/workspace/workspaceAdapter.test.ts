import { describe, expect, it, vi } from "vitest";

vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn(async () => ({
    workspace: { root_path: "/vault", name: "vault" },
    files: []
  }))
}));
vi.mock("../native/dialogs", () => ({
  pickDirectoryPath: vi.fn(async () => null)
}));

import { invokeNativeCommand } from "../native/commands";
import { pickDirectoryPath } from "../native/dialogs";
import { appEvents } from "../events/appEvents";
import { workspaceDesktopApi } from "./workspaceAdapter";

describe("workspace access", () => {
  it("reads native platform capabilities", async () => {
    const capabilities = {
      canOpenFolder: false,
      canCreateManagedWorkspace: true,
      opensWorkspaceInNewWindow: false
    };
    vi.mocked(invokeNativeCommand).mockResolvedValueOnce(capabilities as never);

    await expect(workspaceDesktopApi.workspaceAccessCapabilities()).resolves.toEqual(capabilities);
    expect(invokeNativeCommand).toHaveBeenCalledWith("workspace_access_capabilities");
  });

  it("creates a managed workspace from a name only", async () => {
    const workspace = { root_path: "/app/vaults/Notes", name: "Notes" };
    vi.mocked(invokeNativeCommand).mockResolvedValueOnce(workspace as never);

    await expect(workspaceDesktopApi.createManagedWorkspace("Notes")).resolves.toEqual(workspace);
    expect(invokeNativeCommand).toHaveBeenCalledWith("create_managed_workspace", { name: "Notes" });
  });
});

describe("pickWorkspaceDirectory", () => {
  it("delegates to the native directory picker with the workspace title", async () => {
    vi.mocked(pickDirectoryPath).mockResolvedValueOnce("/vault");

    const result = await workspaceDesktopApi.pickWorkspaceDirectory();

    expect(pickDirectoryPath).toHaveBeenCalledWith("Open workspace");
    expect(result).toBe("/vault");
  });

  it("returns null when the user cancels the picker", async () => {
    vi.mocked(pickDirectoryPath).mockResolvedValueOnce(null);

    const result = await workspaceDesktopApi.pickWorkspaceDirectory();

    expect(result).toBeNull();
  });
});

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

describe("note create events", () => {
  it("emits note.created after a successful Markdown create", async () => {
    vi.mocked(invokeNativeCommand).mockResolvedValueOnce({ is_markdown: true } as never);
    const created = vi.fn();
    const subscription = appEvents.on("note.created", created);

    await workspaceDesktopApi.createWorkspaceFile("/vault", "new.md");

    expect(created).toHaveBeenCalledWith({ rootPath: "/vault", relativePath: "new.md" });
    subscription.dispose();
  });
});

describe("note rename events", () => {
  it("emits note.renamed after a successful rename and returns the entry", async () => {
    const entry = { relative_path: "new.md", name: "new.md", kind: "file", is_markdown: true };
    vi.mocked(invokeNativeCommand).mockResolvedValueOnce({
      entry,
      file_moves: [
        { old_relative_path: "old.md", new_relative_path: "new.md", was_markdown: true, is_markdown: true }
      ]
    } as never);
    const renamed = vi.fn();
    const subscription = appEvents.on("note.renamed", renamed);

    await expect(
      workspaceDesktopApi.renameWorkspaceEntry("/vault", "old.md", "new.md")
    ).resolves.toEqual(entry);

    expect(renamed).toHaveBeenCalledWith({
      rootPath: "/vault",
      oldRelativePath: "old.md",
      newRelativePath: "new.md"
    });
    subscription.dispose();
  });

  it("emits one event per file moved by a folder rename, split by Markdown", async () => {
    vi.mocked(invokeNativeCommand).mockResolvedValueOnce({
      entry: { relative_path: "B", kind: "directory" },
      file_moves: [
        { old_relative_path: "A/note.md", new_relative_path: "B/note.md", was_markdown: true, is_markdown: true },
        { old_relative_path: "A/data.txt", new_relative_path: "B/data.txt", was_markdown: false, is_markdown: false },
        { old_relative_path: "A/sub/deep.md", new_relative_path: "B/sub/deep.md", was_markdown: true, is_markdown: true }
      ]
    } as never);
    const noteRenamed = vi.fn();
    const fileRenamed = vi.fn();
    const noteSub = appEvents.on("note.renamed", noteRenamed);
    const fileSub = appEvents.on("file.renamed", fileRenamed);

    const entry = await workspaceDesktopApi.renameWorkspaceEntry("/vault", "A", "B");

    expect(entry.relative_path).toBe("B");
    expect(noteRenamed.mock.calls.map(([event]) => event.oldRelativePath)).toEqual([
      "A/note.md",
      "A/sub/deep.md"
    ]);
    // The folder itself and non-Markdown files never produce note events.
    expect(fileRenamed).toHaveBeenCalledTimes(1);
    expect(fileRenamed).toHaveBeenCalledWith({
      rootPath: "/vault",
      oldRelativePath: "A/data.txt",
      newRelativePath: "B/data.txt"
    });
    noteSub.dispose();
    fileSub.dispose();
  });

  it("emits file.renamed then note.deleted when a Markdown rename crosses to plain text", async () => {
    vi.mocked(invokeNativeCommand).mockResolvedValueOnce({
      entry: { relative_path: "note.txt", kind: "file" },
      file_moves: [
        { old_relative_path: "note.md", new_relative_path: "note.txt", was_markdown: true, is_markdown: false }
      ]
    } as never);
    const order: string[] = [];
    const subs = [
      appEvents.on("note.renamed", () => order.push("note.renamed")),
      appEvents.on("note.created", () => order.push("note.created")),
      appEvents.on("note.deleted", (e) => order.push(`note.deleted:${e.relativePath}`)),
      appEvents.on("file.renamed", (e) => order.push(`file.renamed:${e.oldRelativePath}->${e.newRelativePath}`))
    ];

    await workspaceDesktopApi.renameWorkspaceEntry("/vault", "note.md", "note.txt");

    // The tab follows the path first; the index drop follows second.
    expect(order).toEqual(["file.renamed:note.md->note.txt", "note.deleted:note.md"]);
    for (const sub of subs) sub.dispose();
  });

  it("emits file.renamed then note.created when a plain text rename crosses to Markdown", async () => {
    vi.mocked(invokeNativeCommand).mockResolvedValueOnce({
      entry: { relative_path: "note.md", kind: "file" },
      file_moves: [
        { old_relative_path: "note.txt", new_relative_path: "note.md", was_markdown: false, is_markdown: true }
      ]
    } as never);
    const order: string[] = [];
    const subs = [
      appEvents.on("note.renamed", () => order.push("note.renamed")),
      appEvents.on("note.created", (e) => order.push(`note.created:${e.relativePath}`)),
      appEvents.on("note.deleted", () => order.push("note.deleted")),
      appEvents.on("file.renamed", (e) => order.push(`file.renamed:${e.oldRelativePath}->${e.newRelativePath}`))
    ];

    await workspaceDesktopApi.renameWorkspaceEntry("/vault", "note.txt", "note.md");

    expect(order).toEqual(["file.renamed:note.txt->note.md", "note.created:note.md"]);
    for (const sub of subs) sub.dispose();
  });

  it("emits nothing when the native rename fails", async () => {
    vi.mocked(invokeNativeCommand).mockRejectedValueOnce(new Error("gone"));
    const renamed = vi.fn();
    const fileRenamed = vi.fn();
    const subscription = appEvents.on("note.renamed", renamed);
    const fileSubscription = appEvents.on("file.renamed", fileRenamed);

    await expect(
      workspaceDesktopApi.renameWorkspaceEntry("/vault", "old.md", "new.md")
    ).rejects.toThrow("gone");

    expect(renamed).not.toHaveBeenCalled();
    expect(fileRenamed).not.toHaveBeenCalled();
    subscription.dispose();
    fileSubscription.dispose();
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
