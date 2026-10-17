import type { Tab, TabKind, TabResource } from "@thinkbrain/core";
import { inferTabKind } from "@thinkbrain/core";
import type { ChangeDesc } from "@codemirror/state";

import {
  activateExistingTab,
  adjacentVisitIndex,
  emptyTabHistory,
  findVisit,
  mapVisitLocations,
  recordVisit,
  rememberActiveVisit,
  removeTab,
  resetHistory as resetTabHistoryEntries,
  setVisitLocation,
  tabTrailId,
  updateVisitTabs,
  type DesktopTabHistory,
  type EditorLocation
} from "./tabHistory";

// The history model lives in tabHistory.ts; re-exported so shell code has a
// single import surface for everything visit-shaped.
export { canGoBackInTabs, canGoForwardInTabs, currentVisit, findVisit, historyDestination, tabTrailId } from "./tabHistory";
export type { EditorLocation } from "./tabHistory";

export interface DesktopTab extends Tab {
  readonly kind: TabKind;
  /**
   * Logical strip-slot identity: which navigation trail this tab's document
   * belongs to. A link replaces the document *inside* a trail; opening a new
   * physical tab starts a fresh one. Back/Forward only walk the active
   * trail. Absent on legacy fixtures — `tabTrailId` falls back to `id`.
   */
  readonly trailId?: string;
  /**
   * The visit this tab's slot was last selected on, remembered while it is
   * inactive so re-activating restores its place in the flat timeline
   * without recording anything.
   */
  readonly historyVisitId?: number;
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
   * Lands the cursor on a recorded visit by id without recording — a
   * revisit, not a new visit. Only visits of the *active* trail are legal
   * destinations; switching trails is a separate explicit activation.
   */
  | { readonly type: "restoreVisit"; readonly visitId: number }
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
      const prepared = prepareTabOpen(state, action.tab, action.placement);
      if (prepared.kind === "noop") return state;
      if (prepared.kind === "activate") return activateExistingTab(state, prepared.tabId);
      const remembered = rememberActiveVisit(state);
      const history = recordVisit(remembered.history, prepared.tab);
      if (prepared.kind === "append") {
        return rememberActiveVisit({
          ...remembered,
          tabs: [...remembered.tabs, prepared.tab],
          activeTabId: prepared.tab.id,
          history
        });
      }
      // Replacing the slot's document continues its trail: the new view
      // keeps the strip index; the displaced view's visits survive for Back.
      const replacedTabId = prepared.replacedTabId;
      const tabs = remembered.tabs.map((tab) =>
        tab.id === replacedTabId ? prepared.tab : tab
      );
      return rememberActiveVisit({
        ...remembered,
        tabs,
        activeTabId: prepared.tab.id,
        closeRequest:
          remembered.closeRequest?.tabId === replacedTabId
            ? { tabId: prepared.tab.id }
            : remembered.closeRequest,
        history
      });
    }
    case "keep":
      return updateTab(state, action.tabId, (tab) =>
        tab.preview ? { ...tab, preview: undefined } : tab
      );
    case "activate":
      return activateExistingTab(state, action.tabId);
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
      return found === null ? state : restoreVisitAtIndex(state, found.index);
    }
    case "resetHistory": {
      const active = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
      const history = resetTabHistoryEntries(state.history, active);
      return history === state.history ? state : { ...state, history };
    }
    case "setDirty": {
      // Compare against the normalized target so `isDirty: false` on a
      // non-dirty tab is a no-op — otherwise `undefined === false` churns
      // the tabs array on every settings-tab open, re-rendering and writing
      // a debounced desktop-state persistence record.
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
// Kinds whose `resource` names a file being *viewed* — the tabs a rename
// retargets and a resource lookup may match. Comparison tabs carry a
// `resource` too, but theirs names what the comparison is about, so they
// never join resource matching.
const FILE_VIEW_KINDS: ReadonlySet<string> = new Set([
  "editor",
  "code-editor",
  "image-viewer",
  "audio-viewer",
  "video-viewer"
]);

/** True when `tab` is an ordinary file view showing `resource` — never a comparison tab. */
export function isFileResourceTab(
  tab: DesktopTab | null | undefined,
  resource?: Required<TabResource>
): tab is DesktopTab {
  if (!tab || !FILE_VIEW_KINDS.has(tab.kind)) return false;
  if (resource === undefined) return tab.resource?.relativePath !== undefined;
  return (
    tab.resource?.rootPath === resource.rootPath &&
    tab.resource.relativePath === resource.relativePath
  );
}

/** Both tabs show the same file — possibly under different view ids. */
function sameResourceView(a: DesktopTab, b: DesktopTab): boolean {
  return (
    isFileResourceTab(a) &&
    isFileResourceTab(b) &&
    a.resource!.rootPath === b.resource!.rootPath &&
    a.resource!.relativePath === b.resource!.relativePath
  );
}

/**
 * The id a renamed view takes: the destination's canonical id plus the
 * view's collision suffix, if it carried one (`…:view:N`). A collision
 * suffix marks a second view of one resource; the rename does not resolve
 * the collision, so the suffix follows.
 */
function retargetViewId(
  oldId: string,
  from: Required<TabResource>,
  to: Required<TabResource>
): string {
  const canonical = documentTabId(to);
  for (const base of [editorTabId(from), fileTabId(from)]) {
    if (oldId.startsWith(base)) return canonical + oldId.slice(base.length);
  }
  return canonical;
}

/** A view id derived from `baseId` no open tab currently holds. */
function uniqueViewId(state: DesktopTabState, baseId: string): string {
  for (let n = 0; ; n += 1) {
    const candidate = `${baseId}:view:${state.history.nextVisitId + n}`;
    if (!state.tabs.some((tab) => tab.id === candidate)) return candidate;
  }
}

/**
 * What an `open` action will do, decided once and shared by the reducer and
 * the shell's loaders — which need the *actual* view id (collision suffix
 * included) before the dispatch runs. `noop` is the resource already on
 * screen; `activate` raises an existing tab showing it (an explicit switch,
 * no visit); `replace` takes over a slot and continues its trail; `append`
 * is a fresh physical tab with a fresh, globally unique trail.
 */
export type PreparedTabOpen =
  | { readonly kind: "noop"; readonly tabId: string }
  | { readonly kind: "activate"; readonly tabId: string }
  | { readonly kind: "append"; readonly tab: DesktopTab }
  | { readonly kind: "replace"; readonly tab: DesktopTab; readonly replacedTabId: string };

export function prepareTabOpen(
  state: DesktopTabState,
  tab: DesktopTab,
  placement: TabOpenPlacement = "new"
): PreparedTabOpen {
  const active = state.tabs.find((candidate) => candidate.id === state.activeTabId);

  if (placement === "replace-active") {
    // Same file already on screen: a link to it is a no-op. A file open in
    // *another* trail is never the answer either — this trail gets its own
    // view rather than switching away.
    if (active && sameResourceView(active, tab)) return { kind: "noop", tabId: active.id };
    const reusable = active && !active.isDirty && REPLACEABLE_KINDS.has(active.kind);
    if (reusable) {
      const id = state.tabs.some((candidate) => candidate.id === tab.id)
        ? uniqueViewId(state, tab.id)
        : tab.id;
      return {
        kind: "replace",
        tab: { ...tab, id, trailId: tabTrailId(active), preview: undefined },
        replacedTabId: active.id
      };
    }
    // A dirty or non-replaceable tab is never displaced: the open becomes a
    // new trail instead of losing the work on screen.
    return appendNewTrail(state, tab);
  }

  // "new"/"preview": a tab already showing this resource is raised — the
  // canonical id first, then any collision view of the same file.
  const existing =
    state.tabs.find((candidate) => candidate.id === tab.id) ??
    state.tabs.find((candidate) => sameResourceView(candidate, tab));
  if (existing) {
    return existing.id === state.activeTabId
      ? { kind: "noop", tabId: existing.id }
      : { kind: "activate", tabId: existing.id };
  }
  const reuseId = placement === "preview" ? reuseTargetId(state) : null;
  if (reuseId !== null) {
    const source = state.tabs.find((candidate) => candidate.id === reuseId)!;
    const id = state.tabs.some((candidate) => candidate.id === tab.id)
      ? uniqueViewId(state, tab.id)
      : tab.id;
    return {
      kind: "replace",
      tab: {
        ...tab,
        id,
        trailId: tabTrailId(source),
        preview: placement === "preview" ? true : undefined
      },
      replacedTabId: reuseId
    };
  }
  return appendNewTrail(
    state,
    placement === "preview" ? { ...tab, preview: true } : tab
  );
}

function appendNewTrail(state: DesktopTabState, tab: DesktopTab): PreparedTabOpen {
  // `nextVisitId` keeps the trail unique across later re-opens of the file.
  return {
    kind: "append",
    tab: { ...tab, trailId: `${tab.id}@${state.history.nextVisitId}` }
  };
}

/**
 * The old→new view-id map a `from`→`to` rename produces — computed in one
 * sorted pass over every matching old view id (open tabs AND retained
 * visits) so the reducer and the shell's document move agree regardless of
 * call order. Open tabs being renamed vacate their ids; unrelated and
 * comparison tabs keep holding theirs. A rename landing on a held id mints
 * a deterministic collision id shared by every descriptor of that view.
 */
export function retargetIdAllocator(
  state: DesktopTabState,
  from: Required<TabResource>,
  to: Required<TabResource>
): (oldId: string) => string {
  const oldIds = new Set<string>();
  const occupied = new Set(state.tabs.map((tab) => tab.id));
  for (const tab of state.tabs) {
    if (isFileResourceTab(tab, from)) {
      oldIds.add(tab.id);
      occupied.delete(tab.id);
    }
  }
  for (const visit of state.history.entries) {
    if (isFileResourceTab(visit.tab, from)) oldIds.add(visit.tab.id);
  }
  const moved = new Map<string, string>();
  let collision = 0;
  const base = documentTabId(to);
  for (const oldId of [...oldIds].sort()) {
    const canonical = retargetViewId(oldId, from, to);
    let id = canonical;
    // An unchanged canonical keeps its id; collision ids hang off the
    // base so a carried `:view:N` suffix never stacks.
    while (id !== oldId && occupied.has(id)) {
      id = `${base}:view:${state.history.nextVisitId + collision++}`;
    }
    moved.set(oldId, id);
    occupied.add(id);
  }
  return (oldId: string): string => moved.get(oldId) ?? oldId;
}

/**
 * Points every ordinary file view of `from` at `to` — resource matching, not
 * id assumptions: a file may be open in several trails under different view
 * ids, and each follows the rename keeping its trail, dirty/preview flags,
 * and id-keyed chrome state. Retained visit descriptors follow the same way.
 */
function retargetTab(
  state: DesktopTabState,
  from: Required<TabResource>,
  to: Required<TabResource>
): DesktopTabState {
  // The replacement is built from the DESTINATION's inferred kind: renaming
  // `note.md` to `note.txt` must hand the view to the text-file renderer.
  const movedId = retargetIdAllocator(state, from, to);
  const movedFor = (tab: DesktopTab): DesktopTab => {
    const built =
      inferTabKind(to.relativePath) === "editor" ? createEditorTab(to) : createFileTab(to);
    return {
      ...built,
      id: movedId(tab.id),
      trailId: tab.trailId,
      historyVisitId: tab.historyVisitId,
      isDirty: tab.isDirty,
      preview: tab.preview
    };
  };
  const matches = (tab: DesktopTab) => isFileResourceTab(tab, from);

  const history = updateVisitTabs(state.history, matches, movedFor);
  const idMap = new Map<string, string>();
  const tabs = state.tabs.map((tab) => {
    if (!matches(tab)) return tab;
    const moved = movedFor(tab);
    if (moved.id !== tab.id) idMap.set(tab.id, moved.id);
    return moved;
  });
  if (idMap.size === 0) {
    return history === state.history ? state : { ...state, history };
  }
  return {
    tabs,
    activeTabId: idMap.get(state.activeTabId ?? "") ?? state.activeTabId,
    closeRequest:
      state.closeRequest && idMap.has(state.closeRequest.tabId)
        ? { tabId: idMap.get(state.closeRequest.tabId)! }
        : state.closeRequest,
    history
  };
}

/**
 * The slot a `"preview"` open may take over, or `null` to open a fresh tab:
 * the standing preview tab — there is only ever one — then a blank new-tab
 * page on screen, which exists precisely to be filled.
 */
function reuseTargetId(state: DesktopTabState): string | null {
  const preview = state.tabs.find((tab) => tab.preview);
  if (preview) return preview.id;
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  return active?.kind === "new-tab" ? active.id : null;
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

/**
 * Lands the cursor on `index`'s visit without recording: history traversal
 * is a revisit, not a new visit — recording it would truncate the Forward
 * tail it just walked out of.
 *
 * Only the *active* trail's visits are destinations. The visit's view takes
 * over the active strip slot — displaced documents reopen from their stored
 * descriptor in place; a destination view id another trail now owns mints a
 * fresh collision id and this trail's same-resource descriptors are
 * rewritten to it so later edits keep mapping. A dirty active view is never
 * displaced (the shell saves first; this is the final guard).
 */
function restoreVisitAtIndex(state: DesktopTabState, index: number): DesktopTabState {
  const visit = state.history.entries[index];
  const activeIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
  const active = activeIndex < 0 ? undefined : state.tabs[activeIndex]!;
  if (!visit || !active) return state;
  const trail = tabTrailId(active);
  if (tabTrailId(visit.tab) !== trail) return state;

  const sameView = active.id === visit.tab.id || sameResourceView(active, visit.tab);
  if (sameView) {
    if (state.history.cursor === index) return state;
    return rememberActiveVisit({ ...state, history: { ...state.history, cursor: index } });
  }
  if (active.isDirty) return state;

  let target = visit.tab;
  let history = state.history;
  if (state.tabs.some((tab, i) => i !== activeIndex && tab.id === target.id)) {
    // The recorded view id belongs to another trail now: mint this trail its
    // own and rewrite same-resource descriptors inside it to match.
    const resource = target.resource;
    const base =
      resource?.rootPath !== undefined && resource.relativePath !== undefined
        ? documentTabId({ rootPath: resource.rootPath, relativePath: resource.relativePath })
        : target.id;
    const viewId = uniqueViewId(state, base);
    target = { ...target, id: viewId };
    history = updateVisitTabs(
      history,
      (tab) => tabTrailId(tab) === trail && sameResourceView(tab, target),
      (tab) => ({ ...tab, id: viewId })
    );
  }

  // Restored destinations come back clean — a stale dirty flag in the
  // snapshot must not resurrect edits the loader cannot have.
  const slot: DesktopTab = {
    ...target,
    trailId: trail,
    preview: active.preview,
    historyVisitId: undefined,
    isDirty: undefined
  };
  const tabs = state.tabs.map((tab, i) => (i === activeIndex ? slot : tab));
  return rememberActiveVisit({
    ...state,
    tabs,
    activeTabId: slot.id,
    history: { ...history, cursor: index }
  });
}

/**
 * Moves the history cursor within the active trail and restores the view it
 * lands on, without recording — see {@link restoreVisitAtIndex}.
 */
function stepHistory(state: DesktopTabState, direction: -1 | 1): DesktopTabState {
  const index = adjacentVisitIndex(state, direction);
  return index < 0 ? state : restoreVisitAtIndex(state, index);
}
