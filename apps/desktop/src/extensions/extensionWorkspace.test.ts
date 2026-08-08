import { describe, expect, it, vi } from "vitest";

import { createExtensionWorkspace } from "./extensionWorkspace";
import type { WorkspaceBridge } from "./workspaceBridge";

const documents = () => ({
  readMarkdownDocument: vi.fn(async () => ({ relative_path: "a.md", contents: "hello" })),
  writeMarkdownDocument: vi.fn(async () => ({ relative_path: "a.md" })),
  createMarkdownDocument: vi.fn(async () => ({ relative_path: "a.md" }))
});

const bridge = (rootPath: string | null): WorkspaceBridge => ({
  rootPath,
  openNote: vi.fn(),
  openTab: vi.fn()
});

const entry = (relativePath: string, overrides: Record<string, unknown> = {}) => ({
  relative_path: relativePath,
  name: relativePath.split("/").at(-1) ?? relativePath,
  parent_path: relativePath.split("/").slice(0, -1).join("/"),
  kind: "file",
  is_markdown: relativePath.endsWith(".md"),
  byte_size: 0,
  updated_at: 1000,
  ...overrides
});

const setup = (rootPath: string | null = "/vault", entries: readonly unknown[] = []) => {
  const api = documents();
  const host = bridge(rootPath);
  const listWorkspaceEntries = vi.fn(async () => entries);
  const workspace = createExtensionWorkspace({
    documents: api as never,
    getBridge: () => host,
    entries: { listWorkspaceEntries } as never
  });
  return { api, host, workspace, listWorkspaceEntries };
};

describe("createExtensionWorkspace", () => {
  it("reports the current workspace root", () => {
    expect(setup("/vault").workspace.rootPath()).toBe("/vault");
  });

  it("reads a note relative to the workspace root", async () => {
    const { api, workspace } = setup();

    await expect(workspace.readNote("notes/a.md")).resolves.toBe("hello");
    expect(api.readMarkdownDocument).toHaveBeenCalledWith({
      rootPath: "/vault",
      relativePath: "notes/a.md"
    });
  });

  it("writes and creates notes relative to the workspace root", async () => {
    const { api, workspace } = setup();

    await workspace.writeNote("notes/a.md", "body");
    await workspace.createNote("notes/b.md", "seed");

    expect(api.writeMarkdownDocument).toHaveBeenCalledWith({
      rootPath: "/vault",
      relativePath: "notes/a.md",
      contents: "body"
    });
    expect(api.createMarkdownDocument).toHaveBeenCalledWith({
      rootPath: "/vault",
      relativePath: "notes/b.md",
      contents: "seed"
    });
  });

  it("opens a note through the shell", async () => {
    const { host, workspace } = setup();

    await workspace.openNote("notes/a.md");

    expect(host.openNote).toHaveBeenCalledWith("notes/a.md");
  });

  /**
   * Every path an extension supplies is workspace-relative. Rejecting escapes
   * here means a mistake names the offending path instead of surfacing as an
   * opaque native error.
   */
  it.each(["/etc/passwd", "../outside.md", "notes/../../outside.md", "C:\\win.md"])(
    "rejects %s as an escaping path",
    async (path) => {
      const { api, workspace } = setup();

      await expect(workspace.readNote(path)).rejects.toThrow(/relative|inside/i);
      expect(api.readMarkdownDocument).not.toHaveBeenCalled();
    }
  );

  it("rejects an empty path", async () => {
    const { workspace } = setup();

    await expect(workspace.readNote("  ")).rejects.toThrow();
  });

  it("fails clearly when no workspace is open", async () => {
    const { api, workspace } = setup(null);

    expect(workspace.rootPath()).toBeNull();
    await expect(workspace.readNote("a.md")).rejects.toThrow(/no workspace/i);
    expect(api.readMarkdownDocument).not.toHaveBeenCalled();
  });

  it("fails clearly when the shell is not mounted", async () => {
    const workspace = createExtensionWorkspace({
      documents: documents() as never,
      getBridge: () => null,
      entries: { listWorkspaceEntries: vi.fn(async () => []) } as never
    });

    await expect(workspace.openNote("a.md")).rejects.toThrow(/not ready/i);
  });
});

describe("listNotes", () => {
  it("lists Markdown notes with their modified times", async () => {
    const { workspace } = setup("/vault", [
      entry("a.md", { updated_at: 1200 }),
      entry("b.md", { updated_at: null })
    ]);

    await expect(workspace.listNotes()).resolves.toEqual([
      { relativePath: "a.md", updatedAt: 1200 },
      { relativePath: "b.md", updatedAt: null }
    ]);
  });

  it("excludes directories and non-Markdown files", async () => {
    const { workspace } = setup("/vault", [
      entry("notes", { kind: "directory", is_markdown: false }),
      entry("cover.png"),
      entry("a.md")
    ]);

    await expect(workspace.listNotes()).resolves.toEqual([
      { relativePath: "a.md", updatedAt: 1000 }
    ]);
  });

  it("filters by folder prefix rather than string prefix", async () => {
    // "journalish" must not match a request for the "journal" folder.
    const { workspace } = setup("/vault", [
      entry("journal/2026/08/2026-08-07.md"),
      entry("journalish/notes.md"),
      entry("journal.md")
    ]);

    const notes = await workspace.listNotes("journal");

    expect(notes.map((note) => note.relativePath)).toEqual([
      "journal/2026/08/2026-08-07.md"
    ]);
  });

  it("accepts a prefix that already ends in a separator", async () => {
    const { workspace } = setup("/vault", [entry("journal/a.md"), entry("other/b.md")]);

    const notes = await workspace.listNotes("journal/");

    expect(notes.map((note) => note.relativePath)).toEqual(["journal/a.md"]);
  });

  it("does not ask the native side for hidden entries", async () => {
    const { workspace, listWorkspaceEntries } = setup("/vault", []);

    await workspace.listNotes();

    expect(listWorkspaceEntries).toHaveBeenCalledWith("/vault", false);
  });

  it("rejects when no workspace is open", async () => {
    const { workspace } = setup(null, []);

    await expect(workspace.listNotes()).rejects.toThrow(/No workspace is open/);
  });

  it("rejects a prefix that escapes the workspace", async () => {
    const { workspace } = setup("/vault", []);

    await expect(workspace.listNotes("../secrets")).rejects.toThrow(/inside the workspace/);
  });
});
