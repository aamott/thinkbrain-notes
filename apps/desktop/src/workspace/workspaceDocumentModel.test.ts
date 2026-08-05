import { describe, expect, it, vi } from "vitest";
import type { NativeMarkdownFileContents, NativeMarkdownFileEntry } from "../native/commands";
import {
  createWorkspaceDocument,
  initialWorkspaceDocumentState,
  loadWorkspaceDocument,
  saveWorkspaceDocument,
  workspaceDocumentReducer
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

  it("uses the native entry path after a save or create", async () => {
    const api = createApi({
      writeMarkdownDocument: vi.fn().mockResolvedValue({ ...entry, relative_path: "welcome.md" }),
      createMarkdownDocument: vi.fn().mockResolvedValue({ ...entry, relative_path: "created.md" })
    });

    await expect(
      saveWorkspaceDocument(api, {
        rootPath: "/notes",
        relativePath: "Notes/welcome.md",
        contents: "Updated"
      })
    ).resolves.toEqual({ ok: true, document: { relative_path: "welcome.md", contents: "Updated" } });
    await expect(
      createWorkspaceDocument(api, { rootPath: "/notes", relativePath: "created.md" })
    ).resolves.toEqual({ ok: true, document: { relative_path: "created.md", contents: "" } });
  });

  it("returns normalized failures without throwing into UI consumers", async () => {
    const api = createApi({ readMarkdownDocument: vi.fn().mockRejectedValue("Access denied") });

    await expect(
      loadWorkspaceDocument(api, { rootPath: "/notes", relativePath: "private.md" })
    ).resolves.toEqual({ ok: false, message: "Access denied" });
  });

  it("keeps a loaded document while reporting and dismissing a save failure", () => {
    const loaded = workspaceDocumentReducer(initialWorkspaceDocumentState, { type: "loaded", document });
    const failed = workspaceDocumentReducer(loaded, { type: "failed", message: "Read-only" });

    expect(failed).toMatchObject({ phase: "error", document, error: "Read-only" });
    expect(workspaceDocumentReducer(failed, { type: "dismiss" })).toEqual({
      phase: "ready",
      document,
      error: null
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
      contents: "Updated"
    });

    expect(commandInvoker).toHaveBeenCalledWith("write_markdown_file", {
      rootPath: "/notes",
      relativePath: "Notes/welcome.md",
      contents: "Updated"
    });
  });
});
