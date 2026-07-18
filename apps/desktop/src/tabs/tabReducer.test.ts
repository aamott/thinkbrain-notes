import { describe, expect, it } from "vitest";

import { emptyTabState, tabReducer } from "./tabReducer";

const firstTab = { id: "one", title: "One.md", kind: "editor" } as const;
const secondTab = { id: "two", title: "Two.md", kind: "editor" } as const;
const thirdTab = { id: "three", title: "Settings", kind: "settings" } as const;

describe("tab reducer", () => {
  it("activates an existing tab instead of adding a duplicate", () => {
    const opened = tabReducer(emptyTabState, { type: "open", tab: firstTab });
    const state = tabReducer(opened, { type: "open", tab: firstTab });

    expect(state).toEqual(opened);
  });

  it("keeps one editor tab for a workspace note even when an ID differs", () => {
    const opened = tabReducer(emptyTabState, {
      type: "open",
      tab: {
        ...firstTab,
        resource: { rootPath: "C:/notes", relativePath: "One.md" }
      }
    });
    const state = tabReducer(opened, {
      type: "open",
      tab: {
        id: "different-id",
        title: "One.md",
        kind: "editor",
        resource: { rootPath: "C:/notes", relativePath: "One.md" }
      }
    });

    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(firstTab.id);
  });

  it("selects the nearest tab after closing the active tab", () => {
    const state = [firstTab, secondTab, thirdTab].reduce(
      (current, tab) => tabReducer(current, { type: "open", tab }),
      emptyTabState
    );
    const afterClosingMiddle = tabReducer(
      tabReducer(state, { type: "activate", tabId: secondTab.id }),
      { type: "close", tabId: secondTab.id }
    );
    const afterClosingLast = tabReducer(afterClosingMiddle, {
      type: "close",
      tabId: thirdTab.id
    });

    expect(afterClosingMiddle.activeTabId).toBe(thirdTab.id);
    expect(afterClosingLast.activeTabId).toBe(firstTab.id);
  });

  it("tracks dirty markers independently for each tab", () => {
    const opened = tabReducer(emptyTabState, { type: "open", tab: firstTab });
    const state = tabReducer(opened, {
      type: "set-dirty",
      tabId: firstTab.id,
      isDirty: true
    });

    expect(state.tabs[0]?.isDirty).toBe(true);
  });
});
