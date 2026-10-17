import type { Tab, TabKind, TabResource } from "@thinkbrain/core";
import { inferTabKind } from "@thinkbrain/core";
import type { ChangeDesc } from "@codemirror/state";

import {
  dropTabVisits,
  emptyTabHistory,
  findVisit,
  mapVisitLocations,
  recordVisit,
  resetHistory as resetTabHistoryEntries,
  retargetVisits,
  setVisitLocation,
  type DesktopTabHistory,
  type EditorLocation,
  type HistoryVisit
} from "./tabHistory";

// The history model lives in tabHistory.ts; re-exported so shell code has a
// single import surface for everything visit-shaped.
export { currentVisit, findVisit } from "./tabHistory";
export type { EditorLocation } from "./tabHistory";

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
  /**
   * Provisional tab: the next file open takes it over in place until an edit
   * (or a double-click) makes it permanent. Transient — never persisted.
   */
  readonly preview?: boolean;
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

interface CloseRequest {
  readonly tabId: string;
}

export interface DesktopTabState {
  readonly tabs: readonly DesktopTab[];
  readonly activeTabId: string | null;
  /** Present only when a dirty tab needs a save/discard/cancel decision. */
  readonly closeRequest: CloseRequest | null;
  readonly history: DesktopTabHistory;
}

/**
 * How an `open` action chooses where the file lands.
 *
 * - `"new"` — always a fresh tab (or activation of the one already open).
 * - `"preview"` — provisional browsing: fill the standing preview tab, else
 *   a blank new-tab page, else open a new preview tab. A permanent tab —
 *   dirty or explicitly kept — is never displaced.
 * - `"replace-active"` — the phone rule: fill the tab on screen when it can
 *   give (replaceable and not dirty), otherwise append. The caller saves
 *   pending edits first; a save that fails leaves the tab dirty, which is
 *   exactly the case that must append rather than lose work.
 */
export type TabOpenPlacement = "new" | "preview" | "replace-active";

export type DesktopTabAction =
  | { readonly type: "open"; readonly tab: DesktopTab; readonly placement?: TabOpenPlacement }
  | { readonly type: "keep"; readonly tabId: string }
  | { readonly type: "activate"; readonly tabId: string }
  | { readonly type: "setDirty"; readonly tabId: string; readonly isDirty: boolean }
  | { readonly type: "requestClose"; readonly tabId: string }
  | { readonly type: "discardClose"; readonly tabId: string }
  | { readonly type: "completeSaveAndClose"; readonly tabId: string }
  | { readonly type: "cancelClose"; readonly tabId: string }
  | { readonly type: "goBack" }
  | { readonly type: "goForward" }
  /**
   * Jumps within the active tab's document — an outline heading, an anchor.
   * Records a fresh visit for the same tab carrying the target position.
   */
  | { readonly type: "navigateToLocation"; readonly location: EditorLocation }
  /**
   * The position the user is leaving, folded into the visit named `visitId`
   * (the cursor's visit when the action was dispatched — batched navigations
   * can move it before the reducer runs). `tabId` optionally guards against
   * filing a capture under a visit since retargeted to another tab.
   */
  | {
      readonly type: "setVisitLocation";
      readonly visitId: number;
      readonly location: EditorLocation;
      readonly tabId?: string;
    }
  /** A transaction in `tabId`'s editor; stored positions map through it. */
  | { readonly type: "mapLocations"; readonly tabId: string; readonly changes: ChangeDesc }
  /**
   * Lands on a recorded visit by id without recording — a revisit, not a new
   * visit. `placement` decides how an absent destination rejoins the strip:
   * omitted keeps the displaced-preview refill, while `"replace-active"`
   * takes over the tab in use — the phone's always-one-surface policy.
   */
  | {
      readonly type: "restoreVisit";
      readonly visitId: number;
      readonly placement?: TabOpenPlacement;
    }
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
  history: emptyTabHistory
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
 * The id matches the kind — `.md` gets the `editor:` id every lookup path
 * computes, so a note is never openable under two ids at once.
 */
export function createFileTab(resource: Required<TabResource>): DesktopTab {
  const relativePath = resource.relativePath;
  const title = relativePath.split("/").filter(Boolean).at(-1) ?? relativePath;
  const kind = inferTabKind(relativePath);

  return {
    id: documentTabId(resource),
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

/** Only Markdown editor tabs count as notes — code/media/settings don't. */
export const isNoteTab = (tab: DesktopTab | null | undefined): tab is DesktopTab =>
  tab?.kind === "editor" &&
  tab.resource?.relativePath?.toLowerCase().endsWith(".md") === true;

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

let newTabCounter = 0;

/**
 * A blank landing tab — the browser's "New Tab" page.
 *
 * Unlike other static kinds, new tabs get unique ids so several can be open
 * at once; they are skipped by persistence rather than restored.
 */
export function createNewTab(): DesktopTab {
  newTabCounter += 1;
  return { id: `new-tab:${newTabCounter}`, title: "New tab", kind: "new-tab" };
}

/**
 * Kinds a file open may take over in place under `"replace-active"`.
 *
 * File-backed viewers and the blank new-tab page are interchangeable as
 * "what is on screen"; chrome surfaces (settings, graph, extensions) and
 * comparison tabs are not — displacing one would destroy a surface the user
 * deliberately opened. Checked together with `isDirty` by the caller.
 */
const REPLACEABLE_KINDS: ReadonlySet<string> = new Set([
  "editor",
  "code-editor",
  "image-viewer",
  "audio-viewer",
  "video-viewer",
  "new-tab"
]);

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
              history: recordVisit(state.history, existing)
            };
      }
      const placement = action.placement ?? "new";
      const reuseId = placement === "new" ? null : reuseTargetId(state, placement);
      if (reuseId !== null) {
        const moved: DesktopTab = { ...action.tab, preview: placement === "preview" || undefined };
        const swapped = replaceTabInPlace(state, reuseId, moved);
        return {
          ...swapped,
          activeTabId: moved.id,
          history: recordVisit(swapped.history, moved)
        };
      }
      // The visit must describe the tab as opened — the preview flag above
      // all, because Back reaching a displaced preview visit refills the
      // standing preview slot rather than spawning a new tab.
      const tab = placement === "preview" ? { ...action.tab, preview: true } : action.tab;
      return {
        ...state,
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
        history: recordVisit(state.history, tab)
      };
    }
    case "keep":
      return updateTab(state, action.tabId, (tab) =>
        tab.preview ? { ...tab, preview: undefined } : tab
      );
    case "activate": {
      const tab = state.tabs.find((candidate) => candidate.id === action.tabId);
      return tab
        ? {
            ...state,
            activeTabId: action.tabId,
            history: recordVisit(state.history, tab)
          }
        : state;
    }
    case "goBack":
      return stepHistory(state, -1);
    case "goForward":
      return stepHistory(state, 1);
    case "navigateToLocation": {
      const active = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (!active) return state;
      const history = recordVisit(state.history, active, action.location);
      return history === state.history ? state : { ...state, history };
    }
    case "setVisitLocation": {
      const history = setVisitLocation(
        state.history,
        action.visitId,
        action.location,
        action.tabId
      );
      return history === state.history ? state : { ...state, history };
    }
    case "mapLocations": {
      const history = mapVisitLocations(state.history, action.tabId, action.changes);
      return history === state.history ? state : { ...state, history };
    }
    case "restoreVisit": {
      const found = findVisit(state.history, action.visitId);
      return found === null
        ? state
        : restoreVisitAtIndex(state, found.index, action.placement);
    }
    case "resetHistory": {
      const active = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
      const history = resetTabHistoryEntries(state.history, active);
      return history === state.history ? state : { ...state, history };
    }
    case "setDirty": {
      // Compare against the normalized target so dispatching `isDirty: false`
      // on a tab whose `isDirty` is already `undefined` is a no-op. Without
      // this, `undefined === false` is `false` and the reducer churns the
      // tabs array on every settings-tab open, triggering an extra re-render
      // and a debounced desktop-state persistence write.
      const target = action.isDirty || undefined;
      return updateTab(state, action.tabId, (tab) =>
        tab.isDirty === target
          ? tab
          // An edit is the moment a preview earns permanence — the next file
          // open must leave this tab alone.
          : { ...tab, isDirty: target, ...(action.isDirty ? { preview: undefined } : {}) }
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

  // The replacement is built from the DESTINATION's inferred kind: renaming
  // `note.md` to `note.txt` must hand the tab to the text-file renderer, not
  // keep it a Markdown editor showing a `.txt` file.
  const moved: DesktopTab =
    inferTabKind(to.relativePath) === "editor" ? createEditorTab(to) : createFileTab(to);

  // Every retained destination follows the rename — open or displaced — so
  // Back to a renamed file lands on its new identity, even while nothing
  // shows the file on screen.
  const history = retargetVisits(state.history, new Set([editorId, fileId]), moved);
  if (!existing) {
    return history === state.history ? state : { ...state, history };
  }

  const movedWithFlags: DesktopTab = {
    ...moved,
    ...(existing.isDirty ? { isDirty: existing.isDirty } : {}),
    ...(existing.preview ? { preview: existing.preview } : {})
  };
  return { ...replaceTabInPlace(state, existing.id, movedWithFlags), history };
}

/**
 * The tab a file open may take over, or `null` to open a fresh one.
 *
 * `"preview"` prefers the standing preview tab — there is only ever one —
 * then a blank new-tab page on screen, which exists precisely to be filled.
 * `"replace-active"` may only take the tab on screen, and only when it is
 * replaceable and holds no unsaved edits.
 */
function reuseTargetId(
  state: DesktopTabState,
  placement: Exclude<TabOpenPlacement, "new">
): string | null {
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (placement === "replace-active") {
    return active && !active.isDirty && REPLACEABLE_KINDS.has(active.kind) ? active.id : null;
  }
  const preview = state.tabs.find((tab) => tab.preview);
  if (preview) return preview.id;
  return active?.kind === "new-tab" ? active.id : null;
}

/**
 * Swaps the tab at `oldId` for `moved`, keeping its strip position and
 * carrying over which tab is selected and any close decision waiting on it.
 *
 * History is deliberately untouched here: preview/replace-active takeover is
 * navigation, not close — the displaced tab's visits keep pointing at its
 * retained descriptor so Back can reopen it. Renames rewrite visits
 * separately through `retargetVisits`.
 */
function replaceTabInPlace(
  state: DesktopTabState,
  oldId: string,
  moved: DesktopTab
): DesktopTabState {
  const tabs = state.tabs
    // Replacing over an id another tab already holds leaves two tabs
    // claiming one identity. Dropping the displaced one keeps ids unique —
    // the shell keys a tab's loaded contents by them.
    .filter((tab) => tab.id !== moved.id || tab.id === oldId)
    .map((tab) => (tab.id === oldId ? moved : tab));

  return {
    tabs,
    activeTabId: state.activeTabId === oldId ? moved.id : state.activeTabId,
    closeRequest: state.closeRequest?.tabId === oldId ? { tabId: moved.id } : state.closeRequest,
    history: state.history
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

  // The closed tab's visits die with it — an explicit close must never be
  // revisit. The cursor keeps pointing at the same *visit* — it shifts left
  // by however many earlier entries died — rather than re-anchoring on the
  // active tab's last occurrence, which would silently promote Forward
  // visits into the Back stack when the user is sitting on an earlier visit
  // of a repeated tab (`[A, B, A]`, cursor on the first A, close an unrelated
  // tab: re-anchoring would jump to the last A).
  const dropped = dropTabVisits(state.history, tabId);
  let entries = dropped.entries;
  let nextVisitId = state.history.nextVisitId;
  let cursor: number;
  const currentEntry = state.history.entries[state.history.cursor];
  if (currentEntry !== undefined && currentEntry.tab.id !== tabId) {
    cursor = state.history.cursor - dropped.removedBeforeCursor;
  } else {
    // The visit the user was on died with the closed tab (or there was none):
    // re-anchor on the most recent visit of the tab left active, so Back
    // never lands on the tab that was just closed.
    cursor = activeTabId === null ? -1 : lastVisitIndexOfTab(entries, activeTabId);
    // Every activated tab has an entry; if state arrived without one (a
    // reducer-external tab list, say a test fixture), record it now.
    if (cursor < 0 && activeTabId !== null) {
      const active = tabs.find((tab) => tab.id === activeTabId);
      if (active) {
        entries = [...entries, { id: nextVisitId, tab: active }];
        nextVisitId += 1;
        cursor = entries.length - 1;
      }
    }
  }

  return {
    tabs,
    activeTabId,
    closeRequest: null,
    history: { entries, cursor, nextVisitId }
  };
}

/** The index of `tabId`'s most recent visit in `entries`, or `-1`. */
function lastVisitIndexOfTab(entries: readonly HistoryVisit[], tabId: string): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]!.tab.id === tabId) return index;
  }
  return -1;
}

/**
 * The index Back (`direction` `-1`) or Forward (`1`) would move the cursor
 * to — plain bounds, because every retained visit is restorable: explicit
 * closes scrub their visits, and displaced ones reopen from the descriptor
 * they carry.
 */
function adjacentVisitIndex(state: DesktopTabState, direction: -1 | 1): number {
  const index = state.history.cursor + direction;
  return index >= 0 && index < state.history.entries.length ? index : -1;
}

/** Whether the title bar's Back button has an earlier visit to return to. */
export function canGoBackInTabs(state: DesktopTabState): boolean {
  return adjacentVisitIndex(state, -1) >= 0;
}

/** Whether the title bar's Forward button has a later visit to re-walk. */
export function canGoForwardInTabs(state: DesktopTabState): boolean {
  return adjacentVisitIndex(state, 1) >= 0;
}

/**
 * The tab descriptor Back (`direction` `-1`) or Forward (`1`) would land on —
 * the visit's retained descriptor, which still names the destination even
 * when its tab was displaced and nothing shows it right now — or `null` when
 * there is nowhere to go.
 */
export function historyDestination(state: DesktopTabState, direction: -1 | 1): DesktopTab | null {
  const index = adjacentVisitIndex(state, direction);
  return index < 0 ? null : state.history.entries[index]!.tab;
}

/**
 * Lands the cursor on `index`'s visit without recording: history traversal
 * is a revisit, not a new visit — recording it would truncate the Forward
 * tail it just walked out of.
 *
 * The visit's tab is reactivated when open; when it was displaced (a preview
 * or replace-active takeover, which is navigation rather than close) it
 * reopens from the descriptor it carries. An absent destination refills the
 * standing preview slot by default — there is only ever one preview tab —
 * or, under `placement: "replace-active"`, the tab in use — the phone's
 * always-one-surface restore. Either way a dirty or chrome tab is never
 * displaced to restore a visit: nothing reusable means the destination
 * simply appends.
 */
function restoreVisitAtIndex(
  state: DesktopTabState,
  index: number,
  placement?: TabOpenPlacement
): DesktopTabState {
  const visit = state.history.entries[index];
  if (!visit) return state;
  const destination = visit.tab;
  if (state.activeTabId === destination.id && state.history.cursor === index) return state;

  let next = state;
  if (!next.tabs.some((tab) => tab.id === destination.id)) {
    const reuseId =
      placement === "replace-active"
        ? reuseTargetId(next, "replace-active")
        : destination.preview === true
          ? (next.tabs.find((tab) => tab.preview === true && !tab.isDirty)?.id ?? null)
          : null;
    next =
      reuseId !== null
        ? // A replace-active landing makes the destination permanent, same as
          // a replace-active open does.
          replaceTabInPlace(next, reuseId, {
            ...destination,
            preview: placement === "replace-active" ? undefined : destination.preview
          })
        : { ...next, tabs: [...next.tabs, destination] };
  }
  return {
    ...next,
    activeTabId: destination.id,
    history: { ...next.history, cursor: index }
  };
}

/**
 * Moves the history cursor and activates the tab it lands on, without
 * recording — see {@link restoreVisitAtIndex}.
 */
function stepHistory(state: DesktopTabState, direction: -1 | 1): DesktopTabState {
  const index = adjacentVisitIndex(state, direction);
  return index < 0 ? state : restoreVisitAtIndex(state, index);
}
