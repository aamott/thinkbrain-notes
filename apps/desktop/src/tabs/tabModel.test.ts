import { describe, expect, it } from "vitest";

import {
  createEditorTab,
  createStaticTab,
  desktopTabReducer,
  initialDesktopTabState
} from "./tabModel";

const welcome = createStaticTab("settings", "Settings");
const firstNote = createEditorTab({ rootPath: "/notes", relativePath: "Ideas/first.md" });
const secondNote = createEditorTab({ rootPath: "/notes", relativePath: "second.md" });

function reduce(...actions: Parameters<typeof desktopTabReducer>[1][]) {
  return actions.reduce(desktopTabReducer, initialDesktopTabState);
}

describe("desktopTabReducer", () => {
  it("opens an editor tab once, selects it, and preserves unsaved changes", () => {
    const opened = reduce(
      { type: "open", tab: firstNote },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      { type: "open", tab: firstNote }
    );

    expect(opened.tabs).toHaveLength(1);
    expect(opened.tabs[0]).toMatchObject({ id: firstNote.id, isDirty: true });
    expect(opened.activeTabId).toBe(firstNote.id);
  });

  it("uses the right neighbour, then left neighbour, when closing the active tab", () => {
    const withTabs = reduce(
      { type: "open", tab: welcome },
      { type: "open", tab: firstNote },
      { type: "open", tab: secondNote },
      { type: "activate", tabId: firstNote.id }
    );
    const closeMiddle = desktopTabReducer(withTabs, { type: "requestClose", tabId: firstNote.id });
    const closeLast = desktopTabReducer(closeMiddle, { type: "requestClose", tabId: secondNote.id });

    expect(closeMiddle.activeTabId).toBe(secondNote.id);
    expect(closeLast.activeTabId).toBe(welcome.id);
  });

  it("does not change the active tab while closing an inactive tab", () => {
    const state = reduce(
      { type: "open", tab: welcome },
      { type: "open", tab: firstNote },
      { type: "activate", tabId: firstNote.id },
      { type: "requestClose", tabId: welcome.id }
    );

    expect(state.activeTabId).toBe(firstNote.id);
    expect(state.tabs.map((tab) => tab.id)).toEqual([firstNote.id]);
  });

  it("holds a dirty tab until discard or a completed save, and permits cancellation", () => {
    const dirty = reduce(
      { type: "open", tab: firstNote },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      { type: "requestClose", tabId: firstNote.id }
    );
    const cancelled = desktopTabReducer(dirty, { type: "cancelClose", tabId: firstNote.id });
    const discarded = desktopTabReducer(dirty, { type: "discardClose", tabId: firstNote.id });
    const saved = desktopTabReducer(dirty, { type: "completeSaveAndClose", tabId: firstNote.id });

    expect(dirty.closeRequest).toEqual({ tabId: firstNote.id });
    expect(cancelled.tabs).toHaveLength(1);
    expect(cancelled.closeRequest).toBeNull();
    expect(discarded).toEqual(initialDesktopTabState);
    expect(saved).toEqual(initialDesktopTabState);
  });

  /**
   * A tab's identity is the path of the file it shows, so a file renamed
   * anywhere — the explorer, another editor, a `git checkout` — leaves the tab
   * pointing at somewhere nothing lives. Saving it there writes the file back
   * under its old name.
   */
  it("moves a tab to follow the file it is showing", () => {
    const state = reduce(
      { type: "open", tab: welcome },
      { type: "open", tab: firstNote },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "Ideas/renamed.md" }
      }
    );

    const moved = createEditorTab({ rootPath: "/notes", relativePath: "Ideas/renamed.md" });
    expect(state.tabs.map((tab) => tab.id)).toEqual([welcome.id, moved.id]);
    expect(state.tabs[1]).toMatchObject({
      id: moved.id,
      title: "renamed.md",
      resource: { rootPath: "/notes", relativePath: "Ideas/renamed.md" },
      isDirty: true
    });
  });

  it("keeps a moved tab selected", () => {
    const state = reduce(
      { type: "open", tab: firstNote },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "moved.md" }
      }
    );

    expect(state.activeTabId).toBe(
      createEditorTab({ rootPath: "/notes", relativePath: "moved.md" }).id
    );
  });

  it("leaves the other tabs selected when a background tab moves", () => {
    const state = reduce(
      { type: "open", tab: firstNote },
      { type: "open", tab: secondNote },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "moved.md" }
      }
    );

    expect(state.activeTabId).toBe(secondNote.id);
  });

  it("ignores a move of a file no tab is showing", () => {
    const state = reduce({ type: "open", tab: firstNote });

    expect(
      desktopTabReducer(state, {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "untouched.md" },
        to: { rootPath: "/notes", relativePath: "elsewhere.md" }
      })
    ).toBe(state);
  });

  it("ignores a move within a workspace this window is not showing", () => {
    const state = reduce({ type: "open", tab: firstNote });

    expect(
      desktopTabReducer(state, {
        type: "retarget",
        from: { rootPath: "/other", relativePath: "Ideas/first.md" },
        to: { rootPath: "/other", relativePath: "moved.md" }
      })
    ).toBe(state);
  });

  /**
   * Renaming one open note over another leaves a single file, so it has to
   * leave a single tab — otherwise two tabs share an id and the shell keys its
   * document state by that id.
   */
  it("replaces the tab already sitting at the destination", () => {
    const state = reduce(
      { type: "open", tab: firstNote },
      { type: "open", tab: secondNote },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "second.md" }
      }
    );

    expect(state.tabs.map((tab) => tab.id)).toEqual([secondNote.id]);
    expect(state.activeTabId).toBe(secondNote.id);
  });

  it("carries a pending close decision over to the moved tab", () => {
    const state = reduce(
      { type: "open", tab: firstNote },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      { type: "requestClose", tabId: firstNote.id },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "moved.md" }
      }
    );

    const moved = createEditorTab({ rootPath: "/notes", relativePath: "moved.md" });
    expect(state.closeRequest).toEqual({ tabId: moved.id });
  });

  it("returns the existing state for unknown tab actions", () => {
    const state = reduce({ type: "open", tab: firstNote });

    expect(desktopTabReducer(state, { type: "activate", tabId: "missing" })).toBe(state);
    expect(desktopTabReducer(state, { type: "requestClose", tabId: "missing" })).toBe(state);
  });
});
