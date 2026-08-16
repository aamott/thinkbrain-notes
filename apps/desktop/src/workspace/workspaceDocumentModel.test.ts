import { describe, expect, it, vi } from "vitest";
import type { NativeMarkdownFileContents, NativeMarkdownFileEntry } from "../native/commands";
import {
  loadWorkspaceDocument,
  saveWorkspaceDocument
} from "./workspaceDocumentModel";
import { createWorkspaceDocumentApi, type WorkspaceDocumentApi } from "./workspaceDocumentAdapter";

const document: NativeMarkdownFileContents = {
  relative_path: "Notes/welcome.md",
  contents: "# Welcome"
};

const entry: NativeMarkdownFileEntry = {
  relative_path: "Notes/welcome.md",
  file_name: "welcome.md",
  parent_path: "Notes",
  byte_size: 9,
  updated_at: null
};

function createApi(overrides: Partial<WorkspaceDocumentApi> = {}): WorkspaceDocumentApi {
  return {
    readMarkdownDocument: vi.fn().mockResolvedValue(document),
    writeMarkdownDocument: vi.fn().mockResolvedValue(entry),
    createMarkdownDocument: vi.fn().mockResolvedValue(entry),
    ...overrides
  };
}

describe("workspace document model", () => {
  it("loads document contents through an injected desktop API", async () => {
    const api = createApi();

    await expect(
      loadWorkspaceDocument(api, { rootPath: "/notes", relativePath: "Notes/welcome.md" })
    ).resolves.toEqual({ ok: true, document });
    expect(api.readMarkdownDocument).toHaveBeenCalledWith({
      rootPath: "/notes",
      relativePath: "Notes/welcome.md"
    });
  });

  it("uses the native entry path after a save", async () => {
    const api = createApi({
      writeMarkdownDocument: vi.fn().mockResolvedValue({ ...entry, relative_path: "welcome.md" })
    });

    await expect(
      saveWorkspaceDocument(api, {
        rootPath: "/notes",
        relativePath: "Notes/welcome.md",
        contents: "Updated",
        expected: undefined
      })
    ).resolves.toEqual({ ok: true, document: { relative_path: "welcome.md", contents: "Updated" } });
  });

  /**
   * The code travels with the message because not every failure means the same
   * thing to the caller: a refused save is a question for the user, while a
   * failed one is an error to report. Only the code tells them apart.
   */
  it("returns normalized failures without throwing into UI consumers", async () => {
    const api = createApi({ readMarkdownDocument: vi.fn().mockRejectedValue("Access denied") });

    await expect(
      loadWorkspaceDocument(api, { rootPath: "/notes", relativePath: "private.md" })
    ).resolves.toEqual({
      ok: false,
      message: "Access denied",
      code: "desktop.native_bridge_error"
    });
  });

  it("reports a refused save under its own code, not as a write failure", async () => {
    const api = createApi({
      writeMarkdownDocument: vi
        .fn()
        .mockRejectedValue({ code: "workspace.note_conflict", message: "The note changed." })
    });

    await expect(
      saveWorkspaceDocument(api, {
        rootPath: "/notes",
        relativePath: "Notes/welcome.md",
        contents: "Mine",
        expected: "stale"
      })
    ).resolves.toEqual({
      ok: false,
      message: "The note changed.",
      code: "workspace.note_conflict"
    });
  });
});

describe("createWorkspaceDocumentApi", () => {
  it("keeps native command names and camelCase argument shapes inside the adapter", async () => {
    const commandInvoker = vi.fn().mockResolvedValue(entry);
    const api = createWorkspaceDocumentApi(commandInvoker);

    await api.writeMarkdownDocument({
      rootPath: "/notes",
      relativePath: "Notes/welcome.md",
      contents: "Updated",
      expected: "On disk"
    });

    expect(commandInvoker).toHaveBeenCalledWith("write_markdown_file", {
      rootPath: "/notes",
      relativePath: "Notes/welcome.md",
      contents: "Updated",
      expected: "On disk"
    });
  });
});
