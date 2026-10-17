import { describe, expect, it } from "vitest";
import {
  createEditorTab,
  desktopTabReducer,
  initialDesktopTabState,
  type DesktopTabState
} from "./tabModel";

const open = (state: DesktopTabState, name: string): DesktopTabState =>
  desktopTabReducer(state, {
    type: "open",
    tab: createEditorTab({ rootPath: "/notes", relativePath: `${name}.md` })
  });

const withTabs = (...names: readonly string[]): DesktopTabState =>
  names.reduce(open, initialDesktopTabState);

const ids = (state: DesktopTabState): readonly string[] => state.tabs.map((tab) => tab.id);

describe("closeMultiple", () => {
  it("closes every clean tab except the clicked one and activates it", () => {
    const state = withTabs("a", "b", "c");
    const target = state.tabs[0]!;

    const next = desktopTabReducer(state, { type: "closeMultiple", tabId: target.id, scope: "others" });

    expect(ids(next)).toEqual([target.id]);
    // The right-clicked tab is the survivor on screen, even though it was
    // not the active one when the action landed.
    expect(next.activeTabId).toBe(target.id);
  });

  it("closes only the clean tabs to the right of the clicked tab", () => {
    const state = withTabs("a", "b", "c", "d");
    const target = state.tabs[1]!;

    const next = desktopTabReducer(state, { type: "closeMultiple", tabId: target.id, scope: "right" });

    expect(ids(next)).toEqual([state.tabs[0]!.id, target.id]);
    expect(next.activeTabId).toBe(target.id);
  });

  it("skips dirty targets instead of confirming them", () => {
    let state = withTabs("a", "b", "c");
    const dirty = state.tabs[2]!;
    state = desktopTabReducer(state, { type: "setDirty", tabId: dirty.id, isDirty: true });
    const target = state.tabs[0]!;

    const next = desktopTabReducer(state, { type: "closeMultiple", tabId: target.id, scope: "others" });

    // b is gone; the dirty tab stays — closing it needs the dialog the
    // menu declines to bypass.
    expect(ids(next)).toEqual([target.id, dirty.id]);
    expect(next.tabs[1]!.isDirty).toBe(true);
    expect(next.activeTabId).toBe(target.id);
  });

  it("scrubs closed trails from history without touching the survivors'", () => {
    const state = withTabs("a", "b", "c");
    const target = state.tabs[0]!;

    const next = desktopTabReducer(state, { type: "closeMultiple", tabId: target.id, scope: "others" });

    // Only the surviving trail keeps visits; the cursor sits on its entry.
    expect(next.history.entries).toHaveLength(1);
    expect(next.history.entries[0]!.tab.id).toBe(target.id);
    expect(next.history.cursor).toBe(0);
  });

  it("keeps a parked close request whose dirty tab survived", () => {
    let state = withTabs("a", "b", "c");
    const dirty = state.tabs[2]!;
    state = desktopTabReducer(state, { type: "setDirty", tabId: dirty.id, isDirty: true });
    state = desktopTabReducer(state, { type: "requestClose", tabId: dirty.id });
    expect(state.closeRequest?.tabId).toBe(dirty.id);
    const target = state.tabs[0]!;

    const next = desktopTabReducer(state, { type: "closeMultiple", tabId: target.id, scope: "others" });

    expect(ids(next)).toEqual([target.id, dirty.id]);
    // The unanswered dialog belongs to a tab that is still open — it must
    // not be swallowed by the removals around it.
    expect(next.closeRequest?.tabId).toBe(dirty.id);
  });

  it("is a no-op for an unknown tab", () => {
    const state = withTabs("a", "b");
    expect(
      desktopTabReducer(state, { type: "closeMultiple", tabId: "missing", scope: "others" })
    ).toBe(state);
    expect(
      desktopTabReducer(state, { type: "closeMultiple", tabId: "missing", scope: "right" })
    ).toBe(state);
  });
});
