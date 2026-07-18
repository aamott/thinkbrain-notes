import type { LayoutPreferences, Tab } from "@thinkbrain/core";

export type TabState = LayoutPreferences;

export type TabAction =
  | { readonly type: "open"; readonly tab: Tab }
  | { readonly type: "activate"; readonly tabId: string }
  | { readonly type: "close"; readonly tabId: string }
  | { readonly type: "set-dirty"; readonly tabId: string; readonly isDirty: boolean };

export const emptyTabState: TabState = {
  tabs: [],
  activeTabId: null
};

/** Pure state transitions keep tab selection rules testable outside React. */
export function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case "open": {
      const existing = state.tabs.find(
        (tab) =>
          tab.id === action.tab.id ||
          (tab.kind === "editor" &&
            action.tab.kind === "editor" &&
            tab.resource?.rootPath === action.tab.resource?.rootPath &&
            tab.resource?.relativePath === action.tab.resource?.relativePath)
      );

      return existing
        ? { ...state, activeTabId: existing.id }
        : { tabs: [...state.tabs, action.tab], activeTabId: action.tab.id };
    }
    case "activate":
      return state.tabs.some((tab) => tab.id === action.tabId)
        ? { ...state, activeTabId: action.tabId }
        : state;
    case "set-dirty":
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.tabId ? { ...tab, isDirty: action.isDirty } : tab
        )
      };
    case "close": {
      const index = state.tabs.findIndex((tab) => tab.id === action.tabId);
      if (index === -1) {
        return state;
      }

      const tabs = state.tabs.filter((tab) => tab.id !== action.tabId);
      if (state.activeTabId !== action.tabId) {
        return { tabs, activeTabId: state.activeTabId };
      }

      return {
        tabs,
        // Prefer the tab that shifted into this position, then the left neighbor.
        activeTabId: tabs[Math.min(index, tabs.length - 1)]?.id ?? null
      };
    }
  }
}
