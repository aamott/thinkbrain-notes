import {
  compareJournalEntries,
  formatJournalDate,
  MONTHS,
  WEEKDAYS,
  type JournalDate
} from "@thinkbrain/core";

import type { JournalEntry, JournalListing } from "./journalService";

/**
 * Turns a journal listing into the rows the popout draws.
 *
 * Pure and DOM-free, so every state in the approved mockup — including the ones
 * that are awkward to reach in a running app — is reachable in a test.
 *
 * Content filtering arrives as a set of matching paths rather than a query: the
 * platform index owns search and metadata facets (D41), and the panel must never
 * scan files itself. The day filter is applied here because a filename already
 * carries its date.
 */

/** What the panel knows about its folder before any rows exist. */
export type JournalStatus =
  | "no-workspace"
  | "invalid-root"
  | "unreadable"
  | "loading"
  | "ready";

export type JournalViewState =
  | "no-workspace"
  | "invalid-root"
  | "unreadable"
  | "loading"
  | "empty"
  | "no-matches"
  | "list";

export type JournalRowKind = "undated" | "undated-entry" | "year" | "month" | "entry";

export interface JournalRow {
  readonly kind: JournalRowKind;
  /** Stable identity: a group key, or the entry's workspace-relative path. */
  readonly key: string;
  readonly label: string;
  /** Entries beneath a header. Absent on entry rows. */
  readonly count: number | null;
  readonly collapsed: boolean | null;
  /** Matches beneath a header while filtering, else `null` (D52). */
  readonly matchCount: number | null;
  readonly dateLabel: string | null;
  readonly timeLabel: string | null;
  /** First line, once loaded for a visible row. `null` until then. */
  readonly preview: string | null;
}

export interface JournalViewInput {
  readonly status: JournalStatus;
  readonly listing: JournalListing | null;
  /** Group keys the user collapsed: `"2026"`, `"2026-08"` (D53). */
  readonly collapsed: ReadonlySet<string>;
  /** Undated is pinned collapsed (D36); this opens it. */
  readonly expandedUndated?: boolean;
  readonly selectedDay: JournalDate | null;
  /** Paths the index matched, or `null` when no content filter is active. */
  readonly matchingPaths: ReadonlySet<string> | null;
  /** Chips currently shown, for the empty-result copy. */
  readonly activeFilterCount: number;
  /** First lines already read; `null` records one that had none. */
  readonly previews: ReadonlyMap<string, string | null>;
}

export interface JournalView {
  readonly state: JournalViewState;
  readonly rows: readonly JournalRow[];
  /** Entries after filtering. */
  readonly showing: number;
  /** Entries before filtering — the M in "showing N of M". */
  readonly total: number;
  readonly activeFilterCount: number;
}

const yearKey = (date: JournalDate): string => String(date.year);
const monthKey = (date: JournalDate): string =>
  `${date.year}-${String(date.month).padStart(2, "0")}`;

/** `Fri 7` — the weekday earns its space by making the list read as days (D35). */
function dateLabel(date: JournalDate): string {
  const weekday = WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()];
  return `${weekday} ${date.day}`;
}

/** 12-hour local time, or `null` for a date-only entry (D42). */
function timeLabel(minuteOfDay: number | null): string | null {
  if (minuteOfDay === null) return null;
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
}

function row(partial: Partial<JournalRow> & Pick<JournalRow, "kind" | "key" | "label">): JournalRow {
  return {
    count: null,
    collapsed: null,
    matchCount: null,
    dateLabel: null,
    timeLabel: null,
    preview: null,
    ...partial
  };
}

export function buildJournalView(input: JournalViewInput): JournalView {
  const { status, listing, collapsed, selectedDay, matchingPaths, previews } = input;

  if (status !== "ready" || !listing) {
    return {
      state: status === "ready" ? "loading" : status,
      rows: [],
      showing: 0,
      total: 0,
      activeFilterCount: input.activeFilterCount
    };
  }

  const filtering = selectedDay !== null || matchingPaths !== null;
  const selected = selectedDay ? formatJournalDate(selectedDay) : null;
  const matches = (entry: JournalEntry): boolean =>
    (selected === null || formatJournalDate(entry.ref.date) === selected) &&
    (matchingPaths === null || matchingPaths.has(entry.relativePath));

  const kept = listing.entries.filter(matches);
  const total = listing.entries.length;

  if (total === 0 && listing.undated.length === 0) {
    return { state: "empty", rows: [], showing: 0, total: 0, activeFilterCount: input.activeFilterCount };
  }
  if (kept.length === 0 && filtering) {
    return {
      state: "no-matches",
      rows: [],
      showing: 0,
      total,
      activeFilterCount: input.activeFilterCount
    };
  }

  const rows: JournalRow[] = [];

  // Undated is a category pinned above the stream, not an error (D36).
  if (listing.undated.length > 0) {
    const expanded = input.expandedUndated ?? false;
    rows.push(
      row({
        kind: "undated",
        key: "undated",
        label: "Undated",
        count: listing.undated.length,
        collapsed: !expanded
      })
    );
    if (expanded) {
      for (const file of [...listing.undated].sort(
        (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
      )) {
        rows.push(
          row({
            kind: "undated-entry",
            key: file.relativePath,
            label: file.relativePath.slice(file.relativePath.lastIndexOf("/") + 1),
            preview: previews.get(file.relativePath) ?? null
          })
        );
      }
    }
  }

  // Sorted here rather than assumed from the caller: the panel's order is its
  // own contract, and a listing that arrives another way must not reorder it.
  const ordered = [...kept].sort((left, right) =>
    compareJournalEntries(right.ref, left.ref)
  );
  const years = new Map<string, JournalEntry[]>();
  for (const entry of ordered) {
    const key = yearKey(entry.ref.date);
    years.set(key, [...(years.get(key) ?? []), entry]);
  }

  for (const [year, yearEntries] of years) {
    // Filtering overrides collapse: a header hiding a match is a defect (D52).
    const yearCollapsed = !filtering && collapsed.has(year);
    rows.push(
      row({
        kind: "year",
        key: year,
        label: year,
        count: yearEntries.length,
        collapsed: yearCollapsed,
        matchCount: filtering ? yearEntries.length : null
      })
    );
    if (yearCollapsed) continue;

    const months = new Map<string, JournalEntry[]>();
    for (const entry of yearEntries) {
      const key = monthKey(entry.ref.date);
      months.set(key, [...(months.get(key) ?? []), entry]);
    }

    for (const [month, monthEntries] of months) {
      const monthCollapsed = !filtering && collapsed.has(month);
      rows.push(
        row({
          kind: "month",
          key: month,
          label: MONTHS[monthEntries[0]!.ref.date.month - 1]!,
          count: monthEntries.length,
          collapsed: monthCollapsed,
          matchCount: filtering ? monthEntries.length : null
        })
      );
      if (monthCollapsed) continue;

      for (const entry of monthEntries) {
        rows.push(
          row({
            kind: "entry",
            key: entry.relativePath,
            label: entry.relativePath,
            dateLabel: dateLabel(entry.ref.date),
            timeLabel: timeLabel(entry.ref.minuteOfDay),
            preview: previews.get(entry.relativePath) ?? null
          })
        );
      }
    }
  }

  return {
    state: "list",
    rows,
    showing: kept.length,
    total,
    activeFilterCount: input.activeFilterCount
  };
}

/**
 * How tall a row of each visual class is, in pixels.
 *
 * Three classes, not five kinds: a year header, any other header, and an entry
 * row — which is what {@link JournalRow} already distinguishes visually, so the
 * height of a row is known from the row itself and never has to be measured
 * per row. Undated sits with the month headers, and an undated entry with the
 * entries, because that is how each is drawn.
 */
export interface JournalRowHeights {
  readonly year: number;
  readonly month: number;
  readonly entry: number;
}

/**
 * Stand-in heights until the panel has measured a real row.
 *
 * Roughly a compact desktop row at the default font size. Being wrong costs a
 * scrollbar that is the wrong length for one frame, not a wrong row: the window
 * is recomputed from measured heights as soon as there is something to measure,
 * and every layout — the coarse-pointer minimum of D76 above all — changes them.
 */
export const ESTIMATED_ROW_HEIGHTS: JournalRowHeights = {
  year: 26,
  month: 26,
  entry: 40
};

/** The height of each row in order, for `rowOffsets`. */
export function journalRowHeights(
  rows: readonly JournalRow[],
  heights: JournalRowHeights
): readonly number[] {
  return rows.map((row) => {
    if (row.kind === "year") return heights.year;
    if (row.kind === "month" || row.kind === "undated") return heights.month;
    return heights.entry;
  });
}
