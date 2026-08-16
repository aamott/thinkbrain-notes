import type { Tab, TabKind, TabResource } from "@thinkbrain/core";

export interface DesktopTab extends Tab {
  readonly kind: TabKind;
}

export interface CloseRequest {
  readonly tabId: string;
}

export interface DesktopTabState {
  readonly tabs: readonly DesktopTab[];
  readonly activeTabId: string | null;
  /** Present only when a dirty tab needs a save/discard/cancel decision. */
  readonly closeRequest: CloseRequest | null;
}

export type DesktopTabAction =
  | { readonly type: "open"; readonly tab: DesktopTab }
  | { readonly type: "activate"; readonly tabId: string }
  | { readonly type: "setDirty"; readonly tabId: string; readonly isDirty: boolean }
  | { readonly type: "requestClose"; readonly tabId: string }
  | { readonly type: "discardClose"; readonly tabId: string }
  | { readonly type: "completeSaveAndClose"; readonly tabId: string }
  | { readonly type: "cancelClose"; readonly tabId: string }
  /** The file a tab is showing was renamed or moved, here or outside the app. */
  | {
      readonly type: "retarget";
      readonly from: Required<TabResource>;
      readonly to: Required<TabResource>;
    };

export const initialDesktopTabState: DesktopTabState = {
  tabs: [],
  activeTabId: null,
  closeRequest: null
};

/** Creates a stable editor identity for a file within a workspace. */
export function editorTabId(resource: TabResource): string {
  return `editor:${encodeURIComponent(resource.rootPath ?? "")}:${encodeURIComponent(resource.relativePath ?? "")}`;
}

/** Builds an editor tab for a Markdown file without choosing a renderer. */
export function createEditorTab(resource: Required<TabResource>): DesktopTab {
  const relativePath = resource.relativePath;
  const title = relativePath.split("/").filter(Boolean).at(-1) ?? relativePath;

  return {
    id: editorTabId(resource),
    title,
    kind: "editor",
    resource
  };
}

export function createStaticTab(kind: Exclude<TabKind, "editor">, title: string): DesktopTab {
  return { id: kind, title, kind };
}

/**
 * Pure tab-state transition function. It never performs persistence or saving:
 * the shell saves a requested dirty tab, then dispatches completeSaveAndClose.
 */
export function desktopTabReducer(
  state: DesktopTabState,
  action: DesktopTabAction
): DesktopTabState {
  switch (action.type) {
    case "open": {
      const existing = state.tabs.find((tab) => tab.id === action.tab.id);
      if (existing) {
        return state.activeTabId === existing.id ? state : { ...state, activeTabId: existing.id };
      }
      return {
        ...state,
        tabs: [...state.tabs, action.tab],
        activeTabId: action.tab.id
      };
    }
    case "activate":
      return state.tabs.some((tab) => tab.id === action.tabId)
        ? { ...state, activeTabId: action.tabId }
        : state;
    case "setDirty": {
      // Compare against the normalized target so dispatching `isDirty: false`
      // on a tab whose `isDirty` is already `undefined` is a no-op. Without
      // this, `undefined === false` is `false` and the reducer churns the
      // tabs array on every settings-tab open, triggering an extra re-render
      // and a debounced desktop-state persistence write.
      const target = action.isDirty || undefined;
      return updateTab(state, action.tabId, (tab) =>
        tab.isDirty === target ? tab : { ...tab, isDirty: target }
      );
    }
    case "requestClose": {
      const tab = state.tabs.find((candidate) => candidate.id === action.tabId);
      if (!tab) return state;
      if (!tab.isDirty) return removeTab(state, tab.id);
      return state.closeRequest?.tabId === tab.id
        ? state
        : { ...state, closeRequest: { tabId: tab.id } };
    }
    case "discardClose":
    case "completeSaveAndClose":
      return state.closeRequest?.tabId === action.tabId ? removeTab(state, action.tabId) : state;
    case "cancelClose":
      return state.closeRequest?.tabId === action.tabId
        ? { ...state, closeRequest: null }
        : state;
    case "retarget":
      return retargetTab(state, action.from, action.to);
  }
}

/**
 * Points the tab showing `from` at `to` instead.
 *
 * A tab's id is built from the path of its file, so following a rename means
 * replacing the tab rather than editing it — and carrying over everything keyed
 * by the old id: which tab is selected, and any close decision waiting on it.
 * Its unsaved edits come with it; the text has not changed, only its name.
 */
function retargetTab(
  state: DesktopTabState,
  from: Required<TabResource>,
  to: Required<TabResource>
): DesktopTabState {
  const oldId = editorTabId(from);
  const existing = state.tabs.find((tab) => tab.id === oldId);
  if (!existing) return state;

  const moved: DesktopTab = {
    ...createEditorTab(to),
    ...(existing.isDirty ? { isDirty: existing.isDirty } : {})
  };

  const tabs = state.tabs
    // Renaming one open note over another leaves one file, so it leaves one
    // tab. Dropping the tab already there keeps ids unique — the shell keys a
    // tab's loaded contents by them.
    .filter((tab) => tab.id !== moved.id || tab.id === oldId)
    .map((tab) => (tab.id === oldId ? moved : tab));

  return {
    tabs,
    activeTabId: state.activeTabId === oldId ? moved.id : state.activeTabId,
    closeRequest: state.closeRequest?.tabId === oldId ? { tabId: moved.id } : state.closeRequest
  };
}

function updateTab(
  state: DesktopTabState,
  tabId: string,
  update: (tab: DesktopTab) => DesktopTab
): DesktopTabState {
  let changed = false;
  const tabs = state.tabs.map((tab) => {
    if (tab.id !== tabId) return tab;
    const next = update(tab);
    changed ||= next !== tab;
    return next;
  });
  return changed ? { ...state, tabs } : state;
}

function removeTab(state: DesktopTabState, tabId: string): DesktopTabState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return state;

  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId = state.activeTabId === tabId
    ? tabs[index]?.id ?? tabs[index - 1]?.id ?? null
    : state.activeTabId;

  return { tabs, activeTabId, closeRequest: null };
}
