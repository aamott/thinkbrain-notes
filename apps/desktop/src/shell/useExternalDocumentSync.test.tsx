// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appEvents } from "../events/appEvents";
import type { Dispatch } from "react";
import {
  createEditorTab,
  createFileTab,
  desktopTabReducer,
  editorTabId,
  fileTabId,
  type DesktopTabAction,
  type DesktopTabState
} from "../tabs/tabModel";
import { useExternalDocumentSync } from "./useExternalDocumentSync";

const ROOT = "/vault";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness({
  tabStateRef,
  moveDocument,
  dispatchTabs,
  markDocumentConflict = vi.fn(),
  reloadDocumentInPlace = vi.fn()
}: {
  readonly tabStateRef: { current: DesktopTabState };
  readonly moveDocument: (fromTabId: string, toTabId: string) => void;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  readonly markDocumentConflict?: (tabId: string) => void;
  readonly reloadDocumentInPlace?: (tabId: string, rootPath: string, relativePath: string) => void;
}) {
  useExternalDocumentSync({
    workspacePath: ROOT,
    tabStateRef,
    dispatchTabs,
    moveDocument,
    markDocumentConflict,
    reloadDocumentInPlace
  });
  return null;
}

async function mount(tabState: DesktopTabState) {
  // Apply the real reducer so dispatched retargets update the state later
  // events read — otherwise a stale snapshot would misjudge a moved tab.
  const tabStateRef: { current: DesktopTabState } = { current: tabState };
  const moveDocument = vi.fn();
  const dispatchTabs = vi.fn((action: DesktopTabAction) => {
    tabStateRef.current = desktopTabReducer(tabStateRef.current, action);
  });
  const markDocumentConflict = vi.fn();
  const reloadDocumentInPlace = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <Harness
        tabStateRef={tabStateRef}
        moveDocument={moveDocument}
        dispatchTabs={dispatchTabs}
        markDocumentConflict={markDocumentConflict}
        reloadDocumentInPlace={reloadDocumentInPlace}
      />
    );
  });
  return { moveDocument, dispatchTabs, markDocumentConflict, reloadDocumentInPlace, tabStateRef };
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("file.renamed retargeting", () => {
  it("retargets an open non-Markdown file tab", async () => {
    const tab = createFileTab({ rootPath: ROOT, relativePath: "data.txt" });
    const { moveDocument, dispatchTabs } = await mount({
      tabs: [tab],
      activeTabId: tab.id,
      closeRequest: null
    });

    await act(async () => {
      appEvents.emit("file.renamed", {
        rootPath: ROOT,
        oldRelativePath: "data.txt",
        newRelativePath: "docs/data.txt"
      });
    });

    const from = { rootPath: ROOT, relativePath: "data.txt" };
    const to = { rootPath: ROOT, relativePath: "docs/data.txt" };
    expect(dispatchTabs).toHaveBeenCalledWith({ type: "retarget", from, to });
    expect(moveDocument).toHaveBeenCalledWith(fileTabId(from), fileTabId(to));
  });

  it("still retargets an open Markdown editor tab on note.renamed", async () => {
    const tab = createEditorTab({ rootPath: ROOT, relativePath: "note.md" });
    const { moveDocument, dispatchTabs } = await mount({
      tabs: [tab],
      activeTabId: tab.id,
      closeRequest: null
    });

    await act(async () => {
      appEvents.emit("note.renamed", {
        rootPath: ROOT,
        oldRelativePath: "note.md",
        newRelativePath: "folder/note.md"
      });
    });

    const from = { rootPath: ROOT, relativePath: "note.md" };
    const to = { rootPath: ROOT, relativePath: "folder/note.md" };
    expect(dispatchTabs).toHaveBeenCalledWith({ type: "retarget", from, to });
    expect(moveDocument).toHaveBeenCalledWith(editorTabId(from), editorTabId(to));
  });

  it("never feeds file.renamed into the note-change planner", async () => {
    // A dirty file tab retargeted by file.renamed must keep its edits — no
    // conflict flag, no reload — because generic file events are not note
    // changes and never reach `planDocumentSync`.
    const tab = { ...createFileTab({ rootPath: ROOT, relativePath: "data.txt" }), isDirty: true };
    const { moveDocument, markDocumentConflict, reloadDocumentInPlace } = await mount({
      tabs: [tab],
      activeTabId: tab.id,
      closeRequest: null
    });

    await act(async () => {
      appEvents.emit("file.renamed", {
        rootPath: ROOT,
        oldRelativePath: "data.txt",
        newRelativePath: "moved.txt"
      });
    });

    expect(moveDocument).toHaveBeenCalledOnce();
    expect(markDocumentConflict).not.toHaveBeenCalled();
    expect(reloadDocumentInPlace).not.toHaveBeenCalled();
  });

  it("moves an editor tab's document to a file tab id when .md becomes .txt", async () => {
    const tab = { ...createEditorTab({ rootPath: ROOT, relativePath: "note.md" }), isDirty: true };
    const { moveDocument, dispatchTabs, markDocumentConflict, reloadDocumentInPlace } = await mount({
      tabs: [tab],
      activeTabId: tab.id,
      closeRequest: null
    });

    // An md→txt rename crosses the Markdown boundary: the adapter emits
    // file.renamed (tab retarget) then note.deleted (index drop).
    await act(async () => {
      appEvents.emit("file.renamed", {
        rootPath: ROOT,
        oldRelativePath: "note.md",
        newRelativePath: "note.txt"
      });
      appEvents.emit("note.deleted", { rootPath: ROOT, relativePath: "note.md" });
    });

    const from = { rootPath: ROOT, relativePath: "note.md" };
    const to = { rootPath: ROOT, relativePath: "note.txt" };
    // The document state moves with the destination's OWN id scheme.
    expect(moveDocument).toHaveBeenCalledWith(editorTabId(from), fileTabId(to));
    expect(dispatchTabs).toHaveBeenCalledWith({ type: "retarget", from, to });
    // The delete of the old path must not flag or reload the moved dirty tab:
    // it is no longer the tab that path refers to.
    expect(markDocumentConflict).not.toHaveBeenCalled();
    expect(reloadDocumentInPlace).not.toHaveBeenCalled();
  });

  it("ignores renames from another workspace and events after unmount", async () => {
    const tab = createFileTab({ rootPath: ROOT, relativePath: "data.txt" });
    const { moveDocument, dispatchTabs } = await mount({
      tabs: [tab],
      activeTabId: tab.id,
      closeRequest: null
    });

    await act(async () => {
      appEvents.emit("file.renamed", {
        rootPath: "/other",
        oldRelativePath: "data.txt",
        newRelativePath: "x.txt"
      });
    });
    expect(dispatchTabs).not.toHaveBeenCalled();

    await act(async () => root?.unmount());
    root = null;
    await act(async () => {
      appEvents.emit("file.renamed", {
        rootPath: ROOT,
        oldRelativePath: "data.txt",
        newRelativePath: "x.txt"
      });
      appEvents.emit("note.renamed", {
        rootPath: ROOT,
        oldRelativePath: "data.txt",
        newRelativePath: "x.txt"
      });
    });
    expect(moveDocument).not.toHaveBeenCalled();
    expect(dispatchTabs).not.toHaveBeenCalled();
  });
});
