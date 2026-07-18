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

  it("returns the existing state for unknown tab actions", () => {
    const state = reduce({ type: "open", tab: firstNote });

    expect(desktopTabReducer(state, { type: "activate", tabId: "missing" })).toBe(state);
    expect(desktopTabReducer(state, { type: "requestClose", tabId: "missing" })).toBe(state);
  });
});
