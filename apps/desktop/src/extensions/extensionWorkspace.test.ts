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

const setup = (rootPath: string | null = "/vault") => {
  const api = documents();
  const host = bridge(rootPath);
  const workspace = createExtensionWorkspace({
    documents: api as never,
    getBridge: () => host
  });
  return { api, host, workspace };
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
      getBridge: () => null
    });

    await expect(workspace.openNote("a.md")).rejects.toThrow(/not ready/i);
  });
});
