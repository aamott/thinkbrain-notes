import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the native command bridge so the store never hits Tauri IPC. Each test
// configures `read_markdown_file` to return the contents it wants.
vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn()
}));

import { invokeNativeCommand, type NativeMarkdownFileContents } from "../native/commands";
import { appEvents } from "../events/appEvents";
import { useWikiLinkIndexStore } from "./wikiLinkIndexStore";
import {
  getBacklinkDetails,
  getBacklinks as getBacklinksFromIndex
} from "@thinkbrain/core";

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
      rootPath: null,
      status: "idle"
    });
    vi.mocked(invokeNativeCommand).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with no workspace and an empty index", () => {
    const state = useWikiLinkIndexStore.getState();
    expect(state.rootPath).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.noteIndex).toEqual([]);
  });

  it("transitions idle to indexing to ready while a read is held", async () => {
    let resolveRead!: (value: NativeMarkdownFileContents) => void;
    vi.mocked(invokeNativeCommand).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRead = resolve))
    );

    const indexing = useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md")]);
    expect(useWikiLinkIndexStore.getState()).toMatchObject({
      rootPath: "/vault",
      status: "indexing",
      noteIndex: []
    });

    resolveRead({ relative_path: "A.md", contents: "body" });
    await indexing;
    expect(useWikiLinkIndexStore.getState().status).toBe("ready");
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
    expect(state.status).toBe("idle");
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

  it("updates backlink contexts across save, create, rename, and delete", async () => {
    mockReadFile({
      "A.md": "old context [[Target]]",
      "Target.md": "body"
    });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("Target.md")]);
    expect(getBacklinkDetails(
      useWikiLinkIndexStore.getState().wikiLinkIndex,
      "Target.md"
    )).toEqual([{ relativePath: "A.md", context: "old context [[Target]]" }]);

    mockReadFile({ "A.md": "saved context [[Target]]" });
    await useWikiLinkIndexStore.getState().reindexDocument("/vault", "A.md");
    mockReadFile({ "C.md": "created context [[Target]]" });
    await useWikiLinkIndexStore.getState().reindexDocument("/vault", "C.md");
    expect(getBacklinkDetails(
      useWikiLinkIndexStore.getState().wikiLinkIndex,
      "Target.md"
    )).toEqual([
      { relativePath: "A.md", context: "saved context [[Target]]" },
      { relativePath: "C.md", context: "created context [[Target]]" }
    ]);

    mockReadFile({ "folder/C.md": "renamed context [[Target]]" });
    await useWikiLinkIndexStore
      .getState()
      .reindexRenamedDocument("/vault", "C.md", "folder/C.md");
    useWikiLinkIndexStore.getState().removeDocument("/vault", "A.md");
    expect(getBacklinkDetails(
      useWikiLinkIndexStore.getState().wikiLinkIndex,
      "Target.md"
    )).toEqual([{
      relativePath: "folder/C.md",
      context: "renamed context [[Target]]"
    }]);
    expect(useWikiLinkIndexStore.getState().status).toBe("ready");
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
    await Promise.resolve();
    let state = useWikiLinkIndexStore.getState();
    expect(state.noteIndex.map((n) => n.relativePath)).toContain("C.md");

    // note.deleted: A is removed.
    appEvents.emit("note.deleted", { rootPath: "/vault", relativePath: "A.md" });
    state = useWikiLinkIndexStore.getState();
    expect(state.noteIndex.map((n) => n.relativePath)).not.toContain("A.md");

    dispose();
  });

  it("keeps the stale entry and logs an error when reindexDocument read fails", async () => {
    mockReadFile({ "A.md": "[[B]]", "B.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("B.md")]);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Simulate a transient read failure (e.g. file locked by a sync tool).
    vi.mocked(invokeNativeCommand).mockRejectedValueOnce(new Error("locked"));

    await useWikiLinkIndexStore.getState().reindexDocument("/vault", "A.md");

    // The stale entry must remain in the index — no data loss.
    const state = useWikiLinkIndexStore.getState();
    expect(state.noteIndex.map((n) => n.relativePath)).toContain("A.md");
    expect(getBacklinksFromIndex(state.wikiLinkIndex, "B.md")).toEqual(["A.md"]);
    // The failure is surfaced loudly, not swallowed at warn level.
    expect(errorSpy).toHaveBeenCalled();
  });

  it("keeps the old entry when reindexRenamedDocument read fails (no data loss)", async () => {
    mockReadFile({ "A.md": "[[B]]", "B.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md"), fileEntry("B.md")]);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // The new path read fails; the old path must NOT be removed from the index.
    vi.mocked(invokeNativeCommand).mockRejectedValueOnce(new Error("locked"));

    await useWikiLinkIndexStore
      .getState()
      .reindexRenamedDocument("/vault", "B.md", "folder/B.md");

    const state = useWikiLinkIndexStore.getState();
    // B.md is still indexed — the note did not vanish.
    expect(state.noteIndex.map((n) => n.relativePath)).toContain("B.md");
    expect(state.noteIndex.map((n) => n.relativePath)).not.toContain("folder/B.md");
    expect(getBacklinksFromIndex(state.wikiLinkIndex, "B.md")).toEqual(["A.md"]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("clears stale workspace data immediately when switching roots", async () => {
    mockReadFile({ "Old.md": "body" });
    await useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/old", [fileEntry("Old.md")]);

    let resolveNew!: (value: NativeMarkdownFileContents) => void;
    vi.mocked(invokeNativeCommand).mockImplementationOnce(
      () => new Promise((resolve) => (resolveNew = resolve))
    );
    const switching = useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/new", [fileEntry("New.md")]);

    expect(useWikiLinkIndexStore.getState()).toMatchObject({
      rootPath: "/new",
      status: "indexing",
      noteIndex: []
    });
    expect(useWikiLinkIndexStore.getState().wikiLinkIndex.backlinks.size).toBe(0);

    resolveNew({ relative_path: "New.md", contents: "body" });
    await switching;
    expect(useWikiLinkIndexStore.getState().noteIndex.map((note) => note.relativePath))
      .toEqual(["New.md"]);
  });

  it("sets error with an empty index after a current outer indexing failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const brokenFiles = new Proxy([fileEntry("A.md")], {
      get(target, property, receiver) {
        if (property === "slice") throw new Error("outer failure");
        return Reflect.get(target, property, receiver);
      }
    }) as readonly ReturnType<typeof fileEntry>[];

    await useWikiLinkIndexStore.getState().indexWorkspace("/vault", brokenFiles);

    expect(useWikiLinkIndexStore.getState()).toMatchObject({
      rootPath: "/vault",
      status: "error",
      noteIndex: []
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[wikiLinkIndexStore] Indexing failed:",
      expect.any(Error)
    );
  });

  it("aborts in-flight reads on workspace switch so stale results do not commit", async () => {
    // First workspace starts indexing with a delayed read.
    let resolveA!: (value: { relative_path: string; contents: string }) => void;
    mockReadFile({ "A.md": "[[B]]" });
    vi.mocked(invokeNativeCommand).mockImplementationOnce(
      () => new Promise((resolve) => (resolveA = resolve))
    );

    const firstIndex = useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/old", [fileEntry("A.md")]);

    // Switch to a new workspace before the old read completes.
    mockReadFile({ "C.md": "body" });
    await useWikiLinkIndexStore.getState().indexWorkspace("/new", [fileEntry("C.md")]);
    expect(useWikiLinkIndexStore.getState().rootPath).toBe("/new");
    expect(useWikiLinkIndexStore.getState().noteIndex.map((n) => n.relativePath)).toEqual([
      "C.md"
    ]);

    // Now complete the stale old-workspace read; it must not clobber the new index.
    resolveA({ relative_path: "A.md", contents: "[[B]]" });
    await firstIndex;

    const state = useWikiLinkIndexStore.getState();
    expect(state.rootPath).toBe("/new");
    expect(state.noteIndex.map((n) => n.relativePath)).toEqual(["C.md"]);
  });

  it("clearWorkspace aborts in-flight indexing so it cannot commit after clear", async () => {
    let resolveA!: (value: { relative_path: string; contents: string }) => void;
    mockReadFile({ "A.md": "[[B]]" });
    vi.mocked(invokeNativeCommand).mockImplementationOnce(
      () => new Promise((resolve) => (resolveA = resolve))
    );

    const indexing = useWikiLinkIndexStore
      .getState()
      .indexWorkspace("/vault", [fileEntry("A.md")]);

    // Close the workspace while reads are still in flight.
    useWikiLinkIndexStore.getState().clearWorkspace();
    expect(useWikiLinkIndexStore.getState().rootPath).toBeNull();

    // Completing the stale read must not repopulate the index.
    resolveA({ relative_path: "A.md", contents: "[[B]]" });
    await indexing;

    const state = useWikiLinkIndexStore.getState();
    expect(state.rootPath).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.noteIndex).toEqual([]);
  });
});
