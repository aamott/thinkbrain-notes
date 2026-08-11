import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the native command bridge so the store never hits Tauri IPC. Each test
// configures `read_markdown_file` to return the contents it wants.
vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn()
}));

import { invokeNativeCommand, type NativeMarkdownFileContents } from "../native/commands";
import { appEvents } from "../events/appEvents";
import { useWikiLinkIndexStore } from "./wikiLinkIndexStore";
import { getBacklinks as getBacklinksFromIndex } from "@thinkbrain/core";

/** Helper: builds a NativeMarkdownFileEntry for a relative path. */
function fileEntry(relativePath: string) {
  return {
    relative_path: relativePath,
    file_name: relativePath.split("/").pop() ?? relativePath,
    parent_path: relativePath.includes("/")
      ? relativePath.slice(0, relativePath.lastIndexOf("/"))
      : "",
    byte_size: 0,
    updated_at: null
  };
}

/** Helper: configures the native mock to return the given file contents. */
function mockReadFile(files: Record<string, string>) {
  vi.mocked(invokeNativeCommand).mockImplementation(
    async (command: string, args?: Record<string, unknown>) => {
      if (command === "read_markdown_file") {
        const relativePath = (args as { relativePath: string }).relativePath;
        const contents = files[relativePath];
        if (contents === undefined) {
          throw new Error(`File not found: ${relativePath}`);
        }
        return { relative_path: relativePath, contents } as NativeMarkdownFileContents;
      }
      throw new Error(`Unexpected command: ${command}`);
    }
  );
}

describe("useWikiLinkIndexStore", () => {
  beforeEach(() => {
    // Reset the store to its initial no-workspace state between tests.
    useWikiLinkIndexStore.setState({
      wikiLinkIndex: {
        forward: new Map(),
        backlinks: new Map(),
        unresolved: new Map(),
        noteIndex: []
      },
      noteIndex: [],
      rootPath: null
    });
    vi.mocked(invokeNativeCommand).mockReset();
  });

  it("starts with no workspace and an empty index", () => {
    const state = useWikiLinkIndexStore.getState();
    expect(state.rootPath).toBeNull();
    expect(state.noteIndex).toEqual([]);
  });

  it("builds the index from all workspace files on indexWorkspace", async () => {
    mockReadFile({
      "A.md": "[[B]] [[Nonexistent]]",
      "B.md": "body"
    });

    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("B.md")]);

    const state = useWikiLinkIndexStore.getState();
    expect(state.rootPath).toBe("/vault");
    expect(state.noteIndex.map((n) => n.relativePath)).toEqual(["A.md", "B.md"]);

    const backlinks = getBacklinksFromIndex(state.wikiLinkIndex, "B.md");
    expect(backlinks).toContain("A.md");
  });

  it("clears the index on clearWorkspace", async () => {
    mockReadFile({ "A.md": "[[B]]", "B.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("B.md")]);
    expect(useWikiLinkIndexStore.getState().rootPath).toBe("/vault");

    useWikiLinkIndexStore.getState().clearWorkspace();

    const state = useWikiLinkIndexStore.getState();
    expect(state.rootPath).toBeNull();
    expect(state.noteIndex).toEqual([]);
  });

  it("incrementally adds a note on reindexDocument (note.saved/created)", async () => {
    mockReadFile({ "A.md": "[[B]]", "B.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("B.md")]);

    // A new note C links to B.
    mockReadFile({ "A.md": "[[B]]", "B.md": "body", "C.md": "[[B]]" });
    await useWikiLinkIndexStore.getState().reindexDocument("/vault", "C.md");

    const state = useWikiLinkIndexStore.getState();
    expect(state.noteIndex.map((n) => n.relativePath)).toContain("C.md");
    const backlinks = getBacklinksFromIndex(state.wikiLinkIndex, "B.md");
    expect([...backlinks].sort()).toEqual(["A.md", "C.md"]);
  });

  it("incrementally updates links on reindexDocument (note content changed)", async () => {
    mockReadFile({ "A.md": "[[B]] [[C]]", "B.md": "body", "C.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("B.md"), fileEntry("C.md")]);

    // A is saved with new content: now only links to B.
    mockReadFile({ "A.md": "[[B]]", "B.md": "body", "C.md": "body" });
    await useWikiLinkIndexStore.getState().reindexDocument("/vault", "A.md");

    const state = useWikiLinkIndexStore.getState();
    expect(getBacklinksFromIndex(state.wikiLinkIndex, "C.md")).toEqual([]);
    expect(getBacklinksFromIndex(state.wikiLinkIndex, "B.md")).toEqual(["A.md"]);
  });

  it("removes a note on removeDocument (note.deleted)", async () => {
    mockReadFile({ "A.md": "[[B]]", "B.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("B.md")]);

    useWikiLinkIndexStore.getState().removeDocument("/vault", "A.md");

    const state = useWikiLinkIndexStore.getState();
    expect(state.noteIndex.map((n) => n.relativePath)).not.toContain("A.md");
    expect(getBacklinksFromIndex(state.wikiLinkIndex, "B.md")).toEqual([]);
  });

  it("handles rename via reindexRenamedDocument (note.renamed)", async () => {
    mockReadFile({ "A.md": "[[B]]", "B.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("B.md")]);

    // B is renamed to folder/B.md.
    mockReadFile({ "A.md": "[[B]]", "folder/B.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .reindexRenamedDocument("/vault", "B.md", "folder/B.md");

    const state = useWikiLinkIndexStore.getState();
    expect(state.noteIndex.map((n) => n.relativePath)).not.toContain("B.md");
    expect(state.noteIndex.map((n) => n.relativePath)).toContain("folder/B.md");
    // A still links to [[B]] which resolves to folder/B.md by filename.
    expect(getBacklinksFromIndex(state.wikiLinkIndex, "folder/B.md")).toEqual(["A.md"]);
  });

  it("ignores events from a different workspace root", async () => {
    mockReadFile({ "A.md": "[[B]]", "B.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("B.md")]);

    // A reindex for a different root should be a no-op.
    mockReadFile({ "A.md": "[[B]]", "B.md": "body", "C.md": "[[B]]" });
    await useWikiLinkIndexStore.getState().reindexDocument("/other", "C.md");

    const state = useWikiLinkIndexStore.getState();
    expect(state.noteIndex.map((n) => n.relativePath)).not.toContain("C.md");
  });

  it("subscribeToEvents keeps the index in sync with note events", async () => {
    mockReadFile({ "A.md": "[[B]]", "B.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("B.md")]);

    const dispose = useWikiLinkIndexStore.getState().subscribeToEvents();

    // note.created: a new note C links to B.
    mockReadFile({ "A.md": "[[B]]", "B.md": "body", "C.md": "[[B]]" });
    appEvents.emit("note.created", { rootPath: "/vault", relativePath: "C.md" });
    // Wait for the async reindex to settle.
    await Promise.resolve();
    await Promise.resolve();
    let state = useWikiLinkIndexStore.getState();
    expect(state.noteIndex.map((n) => n.relativePath)).toContain("C.md");

    // note.deleted: A is removed.
    appEvents.emit("note.deleted", { rootPath: "/vault", relativePath: "A.md" });
    state = useWikiLinkIndexStore.getState();
    expect(state.noteIndex.map((n) => n.relativePath)).not.toContain("A.md");

    dispose();
  });
});
