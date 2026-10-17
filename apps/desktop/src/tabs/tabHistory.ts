/**
 * Location-centric navigation history: the pure half.
 *
 * A visit is a *place the user was* — which tab, and where in the document —
 * not just a tab id. `entries` is one bounded timeline of visits; the cursor
 * is the index of the visit the user is on, so entries before it are the Back
 * stack and entries after it the Forward stack.
 *
 * Invariants the reducer maintains through these helpers:
 *
 * - Every retained visit is restorable. An explicit close scrubs all of that
 *   tab's visits; a preview or replace-active displacement keeps them, so
 *   Back can reopen the displaced tab from its stored descriptor.
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

import type { DesktopTab } from "./tabModel";

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
   * whose tab was displaced — not closed — can be reopened from history,
   * and so Back/Forward tooltips can name destinations no longer open.
   */
  readonly tab: DesktopTab;
  readonly location?: EditorLocation;
}

/**
 * Location history for Back/Forward, in browser order. `entries[cursor]` is
 * the visit the user is on; entries before the cursor are the Back stack,
 * entries after it the Forward stack.
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
 * Appends `tab` as the current visit, truncating anything Forward could have
 * revisited — browser-history semantics.
 *
 * Re-arriving at the visit already at the cursor is a no-op: same tab with no
 * new location (a re-activation), or same tab at the same spot (a duplicate
 * in-file jump). No duplicates, no forward truncation on a no-op.
 */
export function recordVisit(
  history: DesktopTabHistory,
  tab: DesktopTab,
  location?: EditorLocation
): DesktopTabHistory {
  const current = history.entries[history.cursor];
  if (current?.tab.id === tab.id) {
    if (location === undefined || locationsEqual(current.location, location)) {
      return history;
    }
  }
  const visit: HistoryVisit = {
    id: history.nextVisitId,
    tab,
    ...(location === undefined ? {} : { location })
  };
  let entries = [...history.entries.slice(0, history.cursor + 1), visit];
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
 * a capture for a visit that has since been retargeted onto another tab is
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
 * Follows a rename: every visit that named one of `fromIds` — the open tab's
 * or a retained displaced descriptor's — is re-pointed at `to`'s identity
 * (id, title, kind, resource) while keeping the visit's own position and
 * flags. Runs even when no open tab shows `from`, so a renamed resource's
 * retained visits still land on its new name.
 */
export function retargetVisits(
  history: DesktopTabHistory,
  fromIds: ReadonlySet<string>,
  to: DesktopTab
): DesktopTabHistory {
  let changed = false;
  const entries = history.entries.map((visit) => {
    if (!fromIds.has(visit.tab.id)) return visit;
    changed = true;
    return {
      ...visit,
      tab: {
        ...visit.tab,
        id: to.id,
        title: to.title,
        kind: to.kind,
        resource: to.resource
      }
    };
  });
  return changed ? { ...history, entries } : history;
}

/**
 * Drops every visit naming `tabId` — an explicit close, which must never be
 * revisited. Returns the filtered entries plus how many of the dropped
 * entries sat before the old cursor, so the caller can keep the cursor on
 * the same surviving visit.
 */
export function dropTabVisits(
  history: DesktopTabHistory,
  tabId: string
): { readonly entries: readonly HistoryVisit[]; readonly removedBeforeCursor: number } {
  let removedBeforeCursor = 0;
  const entries = history.entries.filter((visit, index) => {
    if (visit.tab.id !== tabId) return true;
    if (index < history.cursor) removedBeforeCursor += 1;
    return false;
  });
  return { entries, removedBeforeCursor };
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
  const visit: HistoryVisit = { id: history.nextVisitId, tab: active };
  return { entries: [visit], cursor: 0, nextVisitId: history.nextVisitId + 1 };
}
