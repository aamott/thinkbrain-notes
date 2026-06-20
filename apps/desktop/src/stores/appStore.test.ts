import { beforeEach, describe, expect, it } from "vitest";

import { type ActiveDocumentState, useAppStore } from "./appStore";

const idleActiveDocument: ActiveDocumentState = {
  status: "idle",
  file: null,
  savedContents: "",
  editorContents: "",
  isDirty: false,
  error: null
};

describe("app store scaffold", () => {
  beforeEach(() => {
    useAppStore.setState({
      bootChecks: 0,
      nativeShell: { status: "idle" },
      workspace: { status: "idle" },
      activeDocument: idleActiveDocument
    });
  });

  it("records boot check interactions", () => {
    useAppStore.getState().recordBootCheck();

    expect(useAppStore.getState().bootChecks).toBe(1);
  });

  it("tracks native shell readiness", () => {
    useAppStore.getState().setNativeShellChecking();

    expect(useAppStore.getState().nativeShell).toEqual({
      status: "checking"
    });

    useAppStore.getState().setNativeShellReady({
      appName: "Thinkbrain Notes",
      shellVersion: "0.0.0",
      ready: true
    });

    expect(useAppStore.getState().nativeShell).toEqual({
      status: "ready",
      shell: {
        appName: "Thinkbrain Notes",
        shellVersion: "0.0.0",
        ready: true
      }
    });
  });

  it("tracks native shell errors", () => {
    useAppStore.getState().setNativeShellError({
      code: "desktop.native_bridge_error",
      message: "bridge unavailable"
    });

    expect(useAppStore.getState().nativeShell).toEqual({
      status: "error",
      error: {
        code: "desktop.native_bridge_error",
        message: "bridge unavailable"
      }
    });
  });

  it("tracks a ready workspace and file list updates", () => {
    useAppStore.getState().setWorkspaceReady(
      {
        rootPath: "C:/notes",
        name: "notes"
      },
      [
        {
          relativePath: "Inbox.md",
          fileName: "Inbox.md",
          parentPath: "",
          byteSize: 1,
          updatedAt: null
        }
      ]
    );

    useAppStore.getState().setWorkspaceFiles([
      {
        relativePath: "Daily.md",
        fileName: "Daily.md",
        parentPath: "",
        byteSize: 2,
        updatedAt: "123"
      }
    ]);

    expect(useAppStore.getState().workspace).toEqual({
      status: "ready",
      workspace: {
        rootPath: "C:/notes",
        name: "notes"
      },
      files: [
        {
          relativePath: "Daily.md",
          fileName: "Daily.md",
          parentPath: "",
          byteSize: 2,
          updatedAt: "123"
        }
      ]
    });
  });

  it("tracks workspace errors", () => {
    useAppStore.getState().setWorkspaceError({
      code: "workspace.open_failed",
      message: "Failed to open the workspace folder."
    });

    expect(useAppStore.getState().workspace).toEqual({
      status: "error",
      error: {
        code: "workspace.open_failed",
        message: "Failed to open the workspace folder."
      }
    });
  });

  it("opens a document and loads its saved baseline", () => {
    useAppStore.getState().openActiveDocument({
      rootPath: "C:/notes",
      relativePath: "Inbox.md",
      fileName: "Inbox.md"
    });

    expect(useAppStore.getState().activeDocument).toEqual({
      status: "loading",
      file: {
        rootPath: "C:/notes",
        relativePath: "Inbox.md",
        fileName: "Inbox.md"
      },
      savedContents: "",
      editorContents: "",
      isDirty: false,
      error: null
    });

    useAppStore.getState().setActiveDocumentLoaded("# Inbox\n");

    expect(useAppStore.getState().activeDocument).toEqual({
      status: "ready",
      file: {
        rootPath: "C:/notes",
        relativePath: "Inbox.md",
        fileName: "Inbox.md"
      },
      savedContents: "# Inbox\n",
      editorContents: "# Inbox\n",
      isDirty: false,
      error: null
    });
  });

  it("marks edited document contents dirty against the loaded baseline", () => {
    useAppStore.getState().openActiveDocument({
      rootPath: "C:/notes",
      relativePath: "Inbox.md",
      fileName: "Inbox.md"
    });
    useAppStore.getState().setActiveDocumentLoaded("# Inbox\n");

    useAppStore
      .getState()
      .updateActiveDocumentContents("# Inbox\n\nNew thought\n");

    expect(useAppStore.getState().activeDocument).toMatchObject({
      savedContents: "# Inbox\n",
      editorContents: "# Inbox\n\nNew thought\n",
      isDirty: true
    });
  });

  it("resets the saved baseline after a successful save", () => {
    useAppStore.getState().openActiveDocument({
      rootPath: "C:/notes",
      relativePath: "Inbox.md",
      fileName: "Inbox.md"
    });
    useAppStore.getState().setActiveDocumentLoaded("# Inbox\n");
    useAppStore.getState().updateActiveDocumentContents("# Inbox\nSaved\n");

    useAppStore.getState().setActiveDocumentSaving();
    useAppStore.getState().markActiveDocumentSaved("# Inbox\nSaved\n");

    expect(useAppStore.getState().activeDocument).toMatchObject({
      status: "ready",
      savedContents: "# Inbox\nSaved\n",
      editorContents: "# Inbox\nSaved\n",
      isDirty: false,
      error: null
    });
  });

  it("keeps dirty state when edits happen during an in-flight save", () => {
    useAppStore.getState().openActiveDocument({
      rootPath: "C:/notes",
      relativePath: "Inbox.md",
      fileName: "Inbox.md"
    });
    useAppStore.getState().setActiveDocumentLoaded("first");
    useAppStore.getState().updateActiveDocumentContents("second");

    useAppStore.getState().setActiveDocumentSaving();
    useAppStore.getState().updateActiveDocumentContents("third");
    useAppStore.getState().markActiveDocumentSaved("second");

    expect(useAppStore.getState().activeDocument).toMatchObject({
      status: "ready",
      savedContents: "second",
      editorContents: "third",
      isDirty: true
    });
  });
});

describe("indexing and search state", () => {
  beforeEach(() => {
    useAppStore.setState({
      activePanel: "explorer",
      indexing: { status: "idle", indexed: 0, total: 0, error: null },
      search: { query: "", status: "idle", results: [], error: null }
    });
  });

  it("toggles the active side panel", () => {
    useAppStore.getState().setActivePanel("search");

    expect(useAppStore.getState().activePanel).toBe("search");
  });

  it("tracks indexing progress through completion", () => {
    useAppStore.getState().startIndexing(3);
    expect(useAppStore.getState().indexing).toEqual({
      status: "indexing",
      indexed: 0,
      total: 3,
      error: null
    });

    useAppStore.getState().setIndexingProgress(2, 3);
    expect(useAppStore.getState().indexing).toMatchObject({
      status: "indexing",
      indexed: 2,
      total: 3
    });

    useAppStore.getState().finishIndexing(3);
    expect(useAppStore.getState().indexing).toMatchObject({
      status: "ready",
      indexed: 3
    });
  });

  it("records indexing failures", () => {
    useAppStore.getState().setIndexingError({
      code: "index.write_failed",
      message: "Failed to update the search index."
    });

    expect(useAppStore.getState().indexing).toMatchObject({
      status: "error",
      error: { code: "index.write_failed" }
    });
  });

  it("resets results when the query is cleared", () => {
    useAppStore.getState().setSearchQuery("roadmap");
    useAppStore.getState().setSearchResults("roadmap", [
      {
        path: "roadmap.md",
        fileName: "roadmap.md",
        title: "Roadmap",
        snippet: "ship search",
        score: -1.2
      }
    ]);

    expect(useAppStore.getState().search).toMatchObject({
      status: "ready",
      results: [{ path: "roadmap.md" }]
    });

    useAppStore.getState().setSearchQuery("   ");

    expect(useAppStore.getState().search).toEqual({
      query: "   ",
      status: "idle",
      results: [],
      error: null
    });
  });

  it("ignores stale search responses for an outdated query", () => {
    useAppStore.getState().setSearchQuery("current");
    useAppStore.getState().setSearchResults("stale", [
      {
        path: "stale.md",
        fileName: "stale.md",
        title: null,
        snippet: "",
        score: 0
      }
    ]);

    expect(useAppStore.getState().search.results).toEqual([]);
  });
});
