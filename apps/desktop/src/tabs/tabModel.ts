import type { Tab, TabKind, TabResource } from "@thinkbrain/core";
import { inferTabKind } from "@thinkbrain/core";

export interface DesktopTab extends Tab {
  readonly kind: TabKind;
  /**
   * For a comparison tab: the file both versions are of.
   *
   * A merge tab's `resource` names the conflict *copy*, because that is what
   * identifies a conflict everywhere else; a version-diff tab's `resource` is
   * the file itself. The source path is still needed in both — to show its
   * name, and to find an editor open on it whose unsaved text is the version
   * the user is actually looking at.
   */
  readonly comparedNotePath?: string;
  /** For a version-diff tab: the recorded change the comparison is against. */
  readonly versionChangeId?: string;
  /** When the selected recorded version was created, in epoch milliseconds. */
  readonly versionAt?: number | null;
}

/** Media viewer tab kinds — read-only, no document state, no save button. */
const MEDIA_VIEWER_KINDS: ReadonlySet<string> = new Set(["image-viewer", "audio-viewer", "video-viewer"]);

/** True for image/audio/video viewer tabs (read-only, no document state). */
export function isMediaViewerKind(kind: string): boolean {
  return MEDIA_VIEWER_KINDS.has(kind);
}

/**
 * Tab kinds whose content is a document the shell loads and keeps.
 *
 * Editor and code-editor tabs render text the shell reads into its document
 * map, so restoring the tab means re-reading its file — skip that and the tab
 * sits on "Loading" forever. Media viewers read their file through the asset
 * protocol and comparison/static tabs carry their own state, so neither is
 * document-backed.
 */
const DOCUMENT_BACKED_KINDS: ReadonlySet<string> = new Set(["editor", "code-editor"]);

/** True for tab kinds that render a document the shell must load for them. */
export function isDocumentBackedKind(kind: string): boolean {
  return DOCUMENT_BACKED_KINDS.has(kind);
}

export interface CloseRequest {
  readonly tabId: string;
}

/**
 * Tab-activation history for title-bar Back/Forward, in browser order.
 *
 * `entries[cursor]` is the visit the user is on — normally the active tab.
 * Entries before the cursor are the Back stack, entries after it the Forward
 * stack. A fresh activation truncates the forward tail, matching browser
 * history. Entries name tab ids, so a retarget rewrites them in place and a
 * close scrubs them — Back can never land on a tab that no longer exists.
 */
export interface DesktopTabHistory {
  readonly entries: readonly string[];
  /** Index of the current visit; `-1` while nothing has been activated. */
  readonly cursor: number;
}

export interface DesktopTabState {
  readonly tabs: readonly DesktopTab[];
  readonly activeTabId: string | null;
  /** Present only when a dirty tab needs a save/discard/cancel decision. */
  readonly closeRequest: CloseRequest | null;
  readonly history: DesktopTabHistory;
}

export type DesktopTabAction =
  | { readonly type: "open"; readonly tab: DesktopTab }
  | { readonly type: "activate"; readonly tabId: string }
  | { readonly type: "setDirty"; readonly tabId: string; readonly isDirty: boolean }
  | { readonly type: "requestClose"; readonly tabId: string }
  | { readonly type: "discardClose"; readonly tabId: string }
  | { readonly type: "completeSaveAndClose"; readonly tabId: string }
  | { readonly type: "cancelClose"; readonly tabId: string }
  | { readonly type: "goBack" }
  | { readonly type: "goForward" }
  /** A workspace switch rebases history onto the surviving active tab. */
  | { readonly type: "resetHistory" }
  /** The file a tab is showing was renamed or moved, here or outside the app. */
  | {
      readonly type: "retarget";
      readonly from: Required<TabResource>;
      readonly to: Required<TabResource>;
    };

export const initialDesktopTabState: DesktopTabState = {
  tabs: [],
  activeTabId: null,
  closeRequest: null,
  history: { entries: [], cursor: -1 }
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

/** Stable identity for a file tab of any kind. */
export function fileTabId(resource: TabResource): string {
  return `file:${encodeURIComponent(resource.rootPath ?? "")}:${encodeURIComponent(resource.relativePath ?? "")}`;
}

/**
 * The id an open document tab would have at `resource` — `editor:` when the
 * extension infers a Markdown editor, `file:` otherwise. Retargeting after a
 * rename must key by the DESTINATION's identity: renaming `note.md` to
 * `note.txt` changes which tab kind owns it.
 */
export function documentTabId(resource: Required<TabResource>): string {
  return inferTabKind(resource.relativePath) === "editor" ? editorTabId(resource) : fileTabId(resource);
}

/**
 * Builds a tab for any file, inferring the tab kind from the extension.
 * Uses `inferTabKind` so `.md` → editor, `.png` → image-viewer, `.ts` →
 * code-editor, etc. The tab kind determines which renderer `TabContent` selects.
 */
export function createFileTab(resource: Required<TabResource>): DesktopTab {
  const relativePath = resource.relativePath;
  const title = relativePath.split("/").filter(Boolean).at(-1) ?? relativePath;
  const kind = inferTabKind(relativePath);

  return {
    id: fileTabId(resource),
    title,
    kind,
    resource
  };
}

/** Stable identity for the comparison of one conflict. */
function conflictTabId(resource: Required<TabResource>): string {
  return `merge:${encodeURIComponent(resource.rootPath)}:${encodeURIComponent(resource.relativePath)}`;
}

/**
 * Builds a tab comparing two versions of a note.
 *
 * `resource.relativePath` is the *copy* the sync daemon left behind, because
 * that is what names a conflict everywhere else — one note can have a copy from
 * each of two machines, and they are two separate decisions. `notePath` is the
 * original, whose name is the one the user recognises in a tab strip.
 */
export function createConflictTab(resource: Required<TabResource>, notePath: string): DesktopTab {
  const name = notePath.split("/").filter(Boolean).at(-1) ?? notePath;
  return {
    id: conflictTabId(resource),
    title: `${name} — Compare versions`,
    kind: "merge",
    resource,
    comparedNotePath: notePath
  };
}

/** Stable identity for a file compared against one recorded version. */
export function versionDiffTabId(resource: Required<TabResource>, changeId: string): string {
  return `version-diff:${encodeURIComponent(resource.rootPath)}:${encodeURIComponent(resource.relativePath)}:${encodeURIComponent(changeId)}`;
}

/**
 * Builds a read-only tab comparing a file's current contents with the version
 * recorded as `changeId`. `resource` is the file itself — unlike a merge tab,
 * there is no conflict copy involved.
 */
export function createVersionDiffTab(
  resource: Required<TabResource>,
  changeId: string,
  versionAt: number | null = null
): DesktopTab {
  const name = resource.relativePath.split("/").filter(Boolean).at(-1) ?? resource.relativePath;
  return {
    id: versionDiffTabId(resource, changeId),
    title: `Restore: ${name}`,
    kind: "version-diff",
    resource,
    comparedNotePath: resource.relativePath,
    versionChangeId: changeId,
    versionAt
  };
}

/**
 * The file a document inspector should treat as open for `tab`, or `null`.
 *
 * Any file-backed tab counts — Markdown editor, code editor, media viewer —
 * but comparison tabs (`merge`, `version-diff`) are excluded: their
 * `resource` names the file the comparison is about (or the conflict copy),
 * not a document being viewed, so panels like Version history must not
 * inspect it.
 */
export function inspectableRelativePath(tab: DesktopTab | null | undefined): string | null {
  if (!tab || tab.kind === "merge" || tab.kind === "version-diff") return null;
  return tab.resource?.relativePath ?? null;
}

/**
 * The name assistive tech and tooltips use for a tab.
 *
 * For a restore preview with a known timestamp it appends the version's date,
 * so two restore tabs of one file are distinguishable. Everything else —
 * and a restore tab whose change carried no timestamp — is just the title.
 */
export function tabAccessibleName(tab: DesktopTab): string {
  if (tab.kind !== "version-diff" || tab.versionAt == null || !Number.isFinite(tab.versionAt)) {
    return tab.title;
  }
  const formatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(tab.versionAt);
  return `${tab.title}, version from ${formatted}`;
}

/**
 * The breadcrumb trail a restore preview shows after the workspace name —
 * `Restore` then the file's path segments — or `null` for any other tab.
 */
export function restoreBreadcrumbSegments(
  tab: DesktopTab | null | undefined
): readonly string[] | null {
  if (tab?.kind !== "version-diff") return null;
  const path = tab.comparedNotePath ?? tab.resource?.relativePath;
  return path ? ["Restore", ...path.split("/").filter(Boolean)] : ["Restore", tab.title];
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
        return state.activeTabId === existing.id
          ? state
          : {
              ...state,
              activeTabId: existing.id,
              history: recordActivation(state.history, existing.id)
            };
      }
      return {
        ...state,
        tabs: [...state.tabs, action.tab],
        activeTabId: action.tab.id,
        history: recordActivation(state.history, action.tab.id)
      };
    }
    case "activate":
      return state.tabs.some((tab) => tab.id === action.tabId)
        ? {
            ...state,
            activeTabId: action.tabId,
            history: recordActivation(state.history, action.tabId)
          }
        : state;
    case "goBack":
      return stepHistory(state, -1);
    case "goForward":
      return stepHistory(state, 1);
    case "resetHistory":
      return resetTabHistory(state);
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
  // The existing tab is found under whichever id scheme its old path used.
  // The replacement is built from the DESTINATION's inferred kind: renaming
  // `note.md` to `note.txt` must hand the tab to the text-file renderer, not
  // keep it a Markdown editor showing a `.txt` file.
  const editorId = editorTabId(from);
  const fileId = fileTabId(from);
  const existing = state.tabs.find((tab) => tab.id === editorId || tab.id === fileId);
  if (!existing) return state;
  const oldId = existing.id;

  const moved: DesktopTab = {
    ...(inferTabKind(to.relativePath) === "editor" ? createEditorTab(to) : createFileTab(to)),
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
    closeRequest: state.closeRequest?.tabId === oldId ? { tabId: moved.id } : state.closeRequest,
    // Visits ride along under the destination id — Back must land on the tab
    // the file became, not on a name nothing answers to.
    history: {
      entries: state.history.entries.map((id) => (id === oldId ? moved.id : id)),
      cursor: state.history.cursor
    }
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

  // The closed tab's visits die with it; the cursor re-anchors on the last
  // visit of the tab that stays active, so Back never lands on the tab that
  // was just closed.
  const entries = state.history.entries.filter((id) => id !== tabId);
  let cursor = activeTabId === null ? -1 : entries.lastIndexOf(activeTabId);
  // Every activated tab has an entry; if state arrived without one (a
  // reducer-external tab list, say a test fixture), record it now.
  if (cursor < 0 && activeTabId !== null) {
    entries.push(activeTabId);
    cursor = entries.length - 1;
  }

  return { tabs, activeTabId, closeRequest: null, history: { entries, cursor } };
}

/**
 * Appends `tabId` as the current visit, truncating anything Forward could
 * have revisited — browser-history semantics. Re-activating the tab already
 * at the cursor is a no-op so repeated dispatches do not stack duplicates.
 */
function recordActivation(history: DesktopTabHistory, tabId: string): DesktopTabHistory {
  if (history.entries[history.cursor] === tabId) return history;
  const entries = [...history.entries.slice(0, history.cursor + 1), tabId];
  return { entries, cursor: entries.length - 1 };
}

/**
 * The index of the nearest visit past the cursor — before it for `direction`
 * `-1`, after it for `1` — that still names an open tab. `-1` when there is
 * nothing live to move to.
 */
function liveEntryIndex(state: DesktopTabState, direction: -1 | 1): number {
  const { entries, cursor } = state.history;
  for (let index = cursor + direction; index >= 0 && index < entries.length; index += direction) {
    if (state.tabs.some((tab) => tab.id === entries[index])) return index;
  }
  return -1;
}

/** Whether the title bar's Back button has a previous tab to return to. */
export function canGoBackInTabs(state: DesktopTabState): boolean {
  return liveEntryIndex(state, -1) >= 0;
}

/** Whether the title bar's Forward button has a later visit to re-walk. */
export function canGoForwardInTabs(state: DesktopTabState): boolean {
  return liveEntryIndex(state, 1) >= 0;
}

/**
 * Moves the history cursor and activates the tab it lands on, without
 * recording: history navigation is a revisit, not a new visit — recording it
 * would truncate the Forward tail it just walked out of.
 */
function stepHistory(state: DesktopTabState, direction: -1 | 1): DesktopTabState {
  const index = liveEntryIndex(state, direction);
  if (index < 0) return state;
  const tabId = state.history.entries[index];
  if (tabId === undefined) return state;
  return {
    ...state,
    activeTabId: tabId,
    history: { entries: state.history.entries, cursor: index }
  };
}

/**
 * Rebases history on the active tab for a workspace switch: Back must never
 * resurrect a previous vault's visits. Already-rebased state is returned
 * unchanged — this also fires on mount while the reducer's initial state is
 * already empty.
 */
function resetTabHistory(state: DesktopTabState): DesktopTabState {
  const active = state.activeTabId !== null && state.tabs.some((tab) => tab.id === state.activeTabId)
    ? state.activeTabId
    : null;
  const entries = active === null ? [] : [active];
  if (
    state.history.cursor === entries.length - 1 &&
    state.history.entries.length === entries.length &&
    state.history.entries.every((id, index) => id === entries[index])
  ) {
    return state;
  }
  return { ...state, history: { entries, cursor: entries.length - 1 } };
}
