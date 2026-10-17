/**
 * Location-centric navigation history: the pure half.
 *
 * A visit is a *place the user was* — which document view, and where in it —
 * not just a tab id. `entries` is one bounded, flat timeline; `tab.trailId`
 * partitions it into independent logical trails (one per strip slot), and the
 * cursor is the index of the visit the user is on within the *active* trail.
 * Entries before it in that trail are its Back stack, entries after it its
 * Forward stack; other trails' visits interleave freely and are never
 * destinations.
 *
 * Invariants the reducer maintains through these helpers:
 *
 * - Every retained visit is restorable. An explicit close scrubs the whole
 *   trail's visits; a replacement keeps them, so Back reopens the displaced
 *   document in the same strip slot from its stored descriptor.
 * - `location` is a plain-data position (selection range, a CodeMirror
 *   scroll snapshot, or an explicit line target). It is written at departure
 *   time by the shell's dispatch wrapper and re-anchored through later edits
 *   by {@link mapVisitLocations} — never a parked `EditorState`, so history
 *   can never resurrect old text or undo.
 * - `nextVisitId` only ever grows, including across a workspace reset, so a
 *   stale visit id — an old phone browser-history entry, say — can never be
 *   mistaken for a newer visit.
 */

import { EditorSelection, type ChangeDesc } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { DesktopTab, DesktopTabState } from "./tabModel";

/**
 * A CodeMirror scroll snapshot: the document position at the viewport's top
 * edge plus the intra-line offset and horizontal scroll, as the lightweight
 * `StateEffect` `view.scrollSnapshot()` produces. Carries no document text —
 * the same shape `editorStateCache` already parks for remounts.
 */
export type ScrollSnapshot = ReturnType<EditorView["scrollSnapshot"]>;

/** Where the user was in a document: primary selection plus how the viewport sat. */
export interface EditorLocation {
  /** Primary selection anchor, as a document offset. */
  readonly anchor: number;
  /** Primary selection head, as a document offset. */
  readonly head: number;
  /**
   * Document position an explicit jump targeted (an outline heading), shown
   * at the top of the viewport on restore. Captured locations carry a
   * `scrollSnapshot` instead.
   */
  readonly scrollPos?: number;
  /** Viewport snapshot with intra-line offset and horizontal scroll. */
  readonly scrollSnapshot?: ScrollSnapshot;
}

/** One place the user visited: a tab descriptor plus an optional in-document position. */
export interface HistoryVisit {
  /**
   * Unique, monotonically increasing identity — stable across edits to the
   * visit and never recycled, so a stale reference cannot name a new visit.
   */
  readonly id: number;
  /**
   * The tab as it was at visit time. Kept whole (not just the id) so a visit
   * whose view was displaced — not closed — can be reopened from history in
   * the same slot, and so Back/Forward tooltips can name destinations no
   * longer open. `historyVisitId` is never stored here: it is cursor
   * metadata about the *open* tab, and a visit is a snapshot.
   */
  readonly tab: DesktopTab;
  readonly location?: EditorLocation;
}

/**
 * Location history for Back/Forward, in browser order. `entries[cursor]` is
 * the visit the user is on; within the active trail, entries before the
 * cursor are the Back stack, entries after it the Forward stack.
 */
export interface DesktopTabHistory {
  readonly entries: readonly HistoryVisit[];
  /** Index of the current visit; `-1` while nothing has been activated. */
  readonly cursor: number;
  /** Next visit identity to hand out; lives in state so the reducer stays pure. */
  readonly nextVisitId: number;
}

export const emptyTabHistory: DesktopTabHistory = {
  entries: [],
  cursor: -1,
  nextVisitId: 1
};

/** Enough for long sessions without unbounded growth; oldest visits drop off the back. */
export const HISTORY_LIMIT = 200;

/**
 * The logical trail a visit or tab belongs to. Real tabs mint one at open;
 * anything without it — legacy fixtures, descriptors — is a trail of one.
 */
export function tabTrailId(tab: { readonly id: string; readonly trailId?: string }): string {
  return tab.trailId ?? tab.id;
}

/** The visit the user is on, or `null` while history is empty. */
export function currentVisit(history: DesktopTabHistory): HistoryVisit | null {
  return history.entries[history.cursor] ?? null;
}

/** A visit and its index by visit id — for go-to-visit APIs. */
export function findVisit(
  history: DesktopTabHistory,
  visitId: number
): { readonly index: number; readonly visit: HistoryVisit } | null {
  const index = history.entries.findIndex((entry) => entry.id === visitId);
  return index < 0 ? null : { index, visit: history.entries[index]! };
}

/** Meaningful-field equality for scroll snapshots — they are rebuilt on every capture. */
function scrollSnapshotsEqual(a: ScrollSnapshot, b: ScrollSnapshot): boolean {
  return (
    a.value.range.anchor === b.value.range.anchor &&
    a.value.range.head === b.value.range.head &&
    a.value.yMargin === b.value.yMargin &&
    a.value.xMargin === b.value.xMargin
  );
}

/** Shallow equality so no-op captures and duplicate in-file jumps do not churn state. */
export function locationsEqual(
  a: EditorLocation | undefined,
  b: EditorLocation | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.anchor !== b.anchor || a.head !== b.head || a.scrollPos !== b.scrollPos) return false;
  const aSnap = a.scrollSnapshot;
  const bSnap = b.scrollSnapshot;
  if (aSnap === bSnap) return true;
  if (!aSnap || !bSnap) return false;
  return scrollSnapshotsEqual(aSnap, bSnap);
}

/**
 * What identifies the document a visit descriptor shows: its file resource
 * when it has one, its view id otherwise (chrome and blank tabs). Two views
 * of one resource in different trails share a resource but never an id.
 */
function visitResourceKey(tab: DesktopTab): string {
  const resource = tab.resource;
  return resource?.rootPath !== undefined && resource.relativePath !== undefined
    ? JSON.stringify([resource.rootPath, resource.relativePath])
    : `id:${tab.id}`;
}

/** The descriptor a visit retains: cursor metadata stripped, flags kept. */
function visitDescriptor(tab: DesktopTab): DesktopTab {
  return tab.historyVisitId === undefined ? tab : { ...tab, historyVisitId: undefined };
}

/**
 * Appends `tab` as the current visit of its trail, truncating only that
 * trail's Forward tail — browser-history semantics, per logical tab. Other
 * trails' visits after the cursor are untouched.
 *
 * Re-arriving at the visit already at the cursor is a no-op: same trail and
 * same resource with no new location, or the same spot again.
 */
export function recordVisit(
  history: DesktopTabHistory,
  tab: DesktopTab,
  location?: EditorLocation
): DesktopTabHistory {
  const trail = tabTrailId(tab);
  const current = history.entries[history.cursor];
  if (
    current &&
    tabTrailId(current.tab) === trail &&
    visitResourceKey(current.tab) === visitResourceKey(tab)
  ) {
    if (location === undefined || locationsEqual(current.location, location)) {
      return history;
    }
  }
  const visit: HistoryVisit = {
    id: history.nextVisitId,
    tab: visitDescriptor(tab),
    ...(location === undefined ? {} : { location })
  };
  let entries = [
    ...history.entries.filter((entry, i) => i <= history.cursor || tabTrailId(entry.tab) !== trail),
    visit
  ];
  const overflow = entries.length - HISTORY_LIMIT;
  if (overflow > 0) entries = entries.slice(overflow);
  return { entries, cursor: entries.length - 1, nextVisitId: history.nextVisitId + 1 };
}

/**
 * Writes the position captured at departure into the visit named `visitId`.
 *
 * The id travels with the action rather than meaning "whatever the cursor is
 * on when the reducer runs": several navigation actions can batch ahead of
 * it, and each departure capture must land on the visit it left, not on a
 * visit the cursor has since moved to. `tabId` is an optional extra guard —
 * a capture for a visit that has since been retargeted onto another view is
 * dropped rather than misfiled.
 */
export function setVisitLocation(
  history: DesktopTabHistory,
  visitId: number,
  location: EditorLocation,
  tabId?: string
): DesktopTabHistory {
  const index = history.entries.findIndex((entry) => entry.id === visitId);
  if (index < 0) return history;
  const visit = history.entries[index]!;
  if (tabId !== undefined && visit.tab.id !== tabId) return history;
  if (locationsEqual(visit.location, location)) return history;
  return {
    ...history,
    entries: history.entries.map((entry, i) => (i === index ? { ...entry, location } : entry))
  };
}

/**
 * Re-anchors every stored location for `tabId` through one transaction's
 * changes, so positions captured before an edit still point at the same text.
 *
 * The selection maps as a `SelectionRange`, which keeps a collapsed caret
 * collapsed — mapping the two endpoints with opposing assoc would grow it
 * into a selection when text lands exactly on the caret. Positions inside
 * deleted or wholesale-replaced ranges clamp to the edit site via `mapPos`'s
 * deletion handling, and the snapshot's own target maps alongside.
 */
export function mapVisitLocations(
  history: DesktopTabHistory,
  tabId: string,
  changes: ChangeDesc
): DesktopTabHistory {
  if (changes.empty) return history;
  let changed = false;
  const entries = history.entries.map((visit) => {
    if (visit.tab.id !== tabId || !visit.location) return visit;
    const range = EditorSelection.range(visit.location.anchor, visit.location.head).map(changes);
    const location: EditorLocation = {
      anchor: range.anchor,
      head: range.head,
      ...(visit.location.scrollPos === undefined
        ? {}
        : { scrollPos: changes.mapPos(visit.location.scrollPos, -1) }),
      ...(visit.location.scrollSnapshot === undefined
        ? {}
        : { scrollSnapshot: visit.location.scrollSnapshot.map(changes) })
    };
    if (locationsEqual(visit.location, location)) return visit;
    changed = true;
    return { ...visit, location };
  });
  return changed ? { ...history, entries } : history;
}

/**
 * Rewrites the descriptor of every visit matching `tab` through `update` —
 * renames (resource follow) and view-id collision repairs both run through
 * this. Positions and visit identity survive untouched.
 */
export function updateVisitTabs(
  history: DesktopTabHistory,
  matches: (tab: DesktopTab) => boolean,
  update: (tab: DesktopTab) => DesktopTab
): DesktopTabHistory {
  let changed = false;
  const entries = history.entries.map((visit) => {
    if (!matches(visit.tab)) return visit;
    const tab = update(visit.tab);
    if (tab === visit.tab) return visit;
    changed = true;
    return { ...visit, tab };
  });
  return changed ? { ...history, entries } : history;
}

/**
 * Drops every visit of `trailId` — an explicit close, which must never be
 * revisited. Returns the filtered entries plus how many of the dropped
 * entries sat before the old cursor, so the caller can keep the cursor on
 * the same surviving visit.
 */
export function dropTrailVisits(
  history: DesktopTabHistory,
  trailId: string
): { readonly entries: readonly HistoryVisit[]; readonly removedBeforeCursor: number } {
  let removedBeforeCursor = 0;
  const entries = history.entries.filter((visit, index) => {
    if (tabTrailId(visit.tab) !== trailId) return true;
    if (index < history.cursor) removedBeforeCursor += 1;
    return false;
  });
  return { entries, removedBeforeCursor };
}

/** The newest visit index belonging to `trailId`, or `-1`. */
function lastTrailVisitIndex(
  entries: readonly HistoryVisit[],
  trailId: string
): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (tabTrailId(entries[index]!.tab) === trailId) return index;
  }
  return -1;
}

/**
 * History for one surviving tab after a workspace reset: a single fresh
 * visit, no carried-over position (the vault changed underneath it anyway).
 * `nextVisitId` carries forward — visit ids must stay unique for the life of
 * the window, never recycle under a new vault's visits.
 */
export function resetHistory(
  history: DesktopTabHistory,
  active: DesktopTab | null
): DesktopTabHistory {
  if (active === null) {
    return history.entries.length === 0 ? history : { ...emptyTabHistory, nextVisitId: history.nextVisitId };
  }
  if (history.cursor === 0 && history.entries.length === 1 && history.entries[0]?.tab.id === active.id) {
    return history;
  }
  const visit: HistoryVisit = { id: history.nextVisitId, tab: visitDescriptor(active) };
  return { entries: [visit], cursor: 0, nextVisitId: history.nextVisitId + 1 };
}

/**
 * Stamps the outgoing active tab's `historyVisitId` with the visit it is
 * leaving. Runs at every activation boundary — one place, not per action —
 * so a re-activated tab can return to exactly where it was selected.
 */
export function rememberActiveVisit(state: DesktopTabState): DesktopTabState {
  const visit = state.history.entries[state.history.cursor];
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!visit || !active || active.historyVisitId === visit.id) return state;
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === active.id ? { ...tab, historyVisitId: visit.id } : tab
    )
  };
}

/**
 * Selects an already-open tab without recording a visit: switching trails
 * is not navigation. The cursor lands on the tab's remembered visit, falling
 * back to its trail's newest retained visit and finally to a fresh seed when
 * the cap has expired them all.
 */
export function activateExistingTab(state: DesktopTabState, tabId: string): DesktopTabState {
  const tab = state.tabs.find((candidate) => candidate.id === tabId);
  if (!tab || state.activeTabId === tabId) return state;
  const next = rememberActiveVisit(state);
  const trail = tabTrailId(tab);
  let history = next.history;
  const remembered =
    tab.historyVisitId === undefined ? null : findVisit(history, tab.historyVisitId);
  if (remembered && tabTrailId(remembered.visit.tab) === trail) {
    history = { ...history, cursor: remembered.index };
  } else {
    const retained = lastTrailVisitIndex(history.entries, trail);
    history =
      retained >= 0 ? { ...history, cursor: retained } : recordVisit(history, tab);
  }
  return rememberActiveVisit({ ...next, activeTabId: tabId, history });
}


/**
 * The index Back (`direction` `-1`) or Forward (`1`) would move the cursor
 * to within the *active* trail — scanning past other trails' interleaved
 * visits, which are never destinations. `-1` when the trail ends there.
 */
export function adjacentVisitIndex(state: DesktopTabState, direction: -1 | 1): number {
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!active) return -1;
  const trail = tabTrailId(active);
  for (
    let index = state.history.cursor + direction;
    index >= 0 && index < state.history.entries.length;
    index += direction
  ) {
    if (tabTrailId(state.history.entries[index]!.tab) === trail) return index;
  }
  return -1;
}

/**
 * Removes a tab and its whole logical trail. An explicit close is not a
 * navigation — the trail's visits must never be revisit destinations, so
 * they are scrubbed and the cursor re-anchors on the neighbouring tab's
 * remembered visit, falling back to that trail's newest retained visit and
 * finally to a fresh seed when the cap has expired them all.
 */
export function removeTab(state: DesktopTabState, tabId: string): DesktopTabState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return state;

  const trail = tabTrailId(state.tabs[index]!);
  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId =
    state.activeTabId === tabId ? (tabs[index]?.id ?? tabs[index - 1]?.id ?? null) : state.activeTabId;

  // A cursor sitting on another trail keeps pointing at the same *visit*,
  // shifted left by however many earlier entries died.
  const dropped = dropTrailVisits(state.history, trail);
  let entries = dropped.entries;
  let nextVisitId = state.history.nextVisitId;
  let cursor: number;
  const currentEntry = state.history.entries[state.history.cursor];
  if (currentEntry !== undefined && tabTrailId(currentEntry.tab) !== trail) {
    cursor = state.history.cursor - dropped.removedBeforeCursor;
  } else if (activeTabId === null) {
    cursor = -1;
  } else {
    const active = tabs.find((tab) => tab.id === activeTabId)!;
    const rememberedIndex = entries.findIndex((entry) => entry.id === active.historyVisitId);
    cursor =
      rememberedIndex >= 0 && tabTrailId(entries[rememberedIndex]!.tab) === tabTrailId(active)
        ? rememberedIndex
        : lastTrailVisitIndex(entries, tabTrailId(active));
    if (cursor < 0) {
      entries = [...entries, { id: nextVisitId, tab: active }];
      nextVisitId += 1;
      cursor = entries.length - 1;
    }
  }

  return rememberActiveVisit({
    tabs,
    activeTabId,
    closeRequest: null,
    history: { entries, cursor, nextVisitId }
  });
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
 * when its view was displaced and nothing shows it right now — or `null`
 * when the active trail ends there.
 */
export function historyDestination(state: DesktopTabState, direction: -1 | 1): DesktopTab | null {
  const index = adjacentVisitIndex(state, direction);
  return index < 0 ? null : state.history.entries[index]!.tab;
}
