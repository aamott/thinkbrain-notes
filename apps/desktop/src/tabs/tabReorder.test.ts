import { describe, expect, it } from "vitest";
import { createEditorTab, desktopTabReducer, initialDesktopTabState } from "./tabModel";

const state = ["a", "b", "c"].reduce(
  (current, title) => desktopTabReducer(current, {
    type: "open", tab: createEditorTab({ rootPath: "/notes", relativePath: `${title}.md` })
  }),
  initialDesktopTabState
);

describe("tab reorder", () => {
  it("moves in both directions without changing identities, selection, or history", () => {
    const moved = desktopTabReducer(state, { type: "reorder", tabId: state.tabs[0]!.id, toIndex: 2 });
    expect(moved.tabs).toEqual([state.tabs[1], state.tabs[2], state.tabs[0]]);
    expect(moved.tabs[2]).toBe(state.tabs[0]);
    expect(moved.activeTabId).toBe(state.activeTabId);
    expect(moved.history).toBe(state.history);
    expect(moved.closeRequest).toBe(state.closeRequest);
    const restored = desktopTabReducer(moved, { type: "reorder", tabId: state.tabs[0]!.id, toIndex: 0 });
    expect(restored.tabs).toEqual(state.tabs);
  });

  it("clamps out-of-range indices and safely ignores invalid inputs", () => {
    const first = state.tabs[0]!.id;
    expect(desktopTabReducer(state, { type: "reorder", tabId: first, toIndex: -100 })).toBe(state);
    expect(desktopTabReducer(state, { type: "reorder", tabId: first, toIndex: 100 }).tabs.at(-1)?.id).toBe(first);
    for (const toIndex of [NaN, Infinity, -Infinity]) {
      expect(desktopTabReducer(state, { type: "reorder", tabId: first, toIndex })).toBe(state);
    }
    expect(desktopTabReducer(state, { type: "reorder", tabId: "missing", toIndex: 1 })).toBe(state);
    expect(desktopTabReducer(initialDesktopTabState, { type: "reorder", tabId: first, toIndex: 0 })).toBe(initialDesktopTabState);
  });
});
