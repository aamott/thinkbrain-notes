import type { NoteDiagnostic } from "../note-model";
import { compareJournalEntries, UNDATED, type JournalFilenameResult } from "./filename";
import { formatJournalDate, sameDate } from "./frontmatter";
import type { JournalDate, JournalEntryRef, JournalFieldValue } from "./types";

/**
 * The calendar's data model: entries in, day cells out.
 *
 * Pure and platform-agnostic. It reads calendar labels — the year, month, and
 * day a filename already states — and never converts through a timestamp, so a
 * device's timezone cannot move an entry to a neighbouring day (D19).
 *
 * It assigns no colour, icon, or vocabulary to anything (D4): field names and
 * values pass through exactly as the user wrote them.
 */

/** How far along the underlying folder read is. */
export type CalendarStatus = "ready" | "loading" | "error";

/** What a single cell should render. */
export type CalendarDayState = "loading" | "error" | "empty" | "has-entries";

/** A value as the calendar summarises it: a list element, or a scalar. */
export type CalendarValue = string | number;

/** An entry the calendar can place, with the metadata already read from it. */
export interface CalendarEntry {
  readonly relativePath: string;
  /** From the filename, which is authoritative (D20); `UNDATED` when it has no date (D38). */
  readonly ref: JournalFilenameResult;
  /** Field values as read, opaque to this module (D4). */
  readonly values: Readonly<Record<string, JournalFieldValue>>;
  /** Anything noticed while reading the entry, surfaced on its day. */
  readonly diagnostics?: readonly NoteDiagnostic[];
}

/** One field's active selection. Any listed value satisfies it. */
export interface CalendarPredicate {
  readonly field: string;
  readonly values: readonly CalendarValue[];
}

/**
 * Filter state shared by the calendar and the journal popout (D25).
 *
 * The selected day and the metadata predicates are separate so each can be
 * cleared on its own (D60).
 */
export interface CalendarFilter {
  readonly selectedDay: JournalDate | null;
  readonly predicates: readonly CalendarPredicate[];
}

/** An inclusive span of days. */
export interface CalendarRange {
  readonly start: JournalDate;
  readonly end: JournalDate;
}

export interface CalendarDay {
  readonly date: JournalDate;
  readonly state: CalendarDayState;
  /** The day's matching entries, chronological. */
  readonly entries: readonly CalendarEntry[];
  /** The exact matching count — what accessible text reports (D46). */
  readonly count: number;
  /** Dots to draw, capped at three (D46). */
  readonly visibleDots: number;
  /** Matching entries beyond the cap, or `0` (D46). */
  readonly overflow: number;
  /** Every distinct value per field across the day's matching entries (D43). */
  readonly values: Readonly<Record<string, readonly CalendarValue[]>>;
  readonly diagnostics: readonly NoteDiagnostic[];
}

export interface CalendarAggregate {
  readonly days: readonly CalendarDay[];
  /**
   * Matching entries with no date, pinned outside the grid (D36).
   *
   * Never placed in a cell: the app does not guess which day they belong to
   * (D38), and a guess would file an entry where the user will not look.
   */
  readonly undated: readonly CalendarEntry[];
  readonly status: CalendarStatus;
}

/** The most dots a cell draws before it switches to `+N` (D46). */
const MAX_DOTS = 3;

/** Compares dates as labels; `Date.UTC` is arithmetic here, not a conversion. */
function toOrdinal(date: JournalDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

/** Every date from `start` to `end` inclusive; empty when the range runs backwards. */
function eachDay(range: CalendarRange): JournalDate[] {
  const days: JournalDate[] = [];
  const last = toOrdinal(range.end);
  for (
    let cursor = new Date(toOrdinal(range.start));
    cursor.getTime() <= last;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    days.push({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate()
    });
  }
  return days;
}

function toValues(value: JournalFieldValue): readonly CalendarValue[] {
  return Array.isArray(value) ? value : [value as CalendarValue];
}

/** True when the entry satisfies every active predicate (D43). */
function matchesPredicates(
  entry: CalendarEntry,
  predicates: readonly CalendarPredicate[]
): boolean {
  return predicates.every((predicate) => {
    const value = entry.values[predicate.field];
    if (value === undefined) return false;
    return toValues(value).some((candidate) => predicate.values.includes(candidate));
  });
}

/** An entry whose filename gave it a date, and so a place in the grid. */
type DatedEntry = CalendarEntry & { readonly ref: JournalEntryRef };

function isDated(entry: CalendarEntry): entry is DatedEntry {
  return entry.ref !== UNDATED;
}

function byChronology(left: DatedEntry, right: DatedEntry): number {
  return compareJournalEntries(left.ref, right.ref);
}

/** Entries on one day, chronological. Undated entries belong to no day (D38). */
export function filterEntriesByDay(
  entries: readonly CalendarEntry[],
  day: JournalDate
): readonly CalendarEntry[] {
  return entries
    .filter(isDated)
    .filter((entry) => sameDate(entry.ref.date, day))
    .sort(byChronology);
}

/**
 * Applies the shared filter state to a list of entries.
 *
 * The popout and the calendar run the same predicates over the same entries, so
 * a day's dot count and the list below it can never disagree (D25).
 */
export function filterEntries(
  entries: readonly CalendarEntry[],
  filter: CalendarFilter
): readonly CalendarEntry[] {
  const day = filter.selectedDay;
  return entries.filter(
    (entry) =>
      matchesPredicates(entry, filter.predicates) &&
      (day === null || (isDated(entry) && sameDate(entry.ref.date, day)))
  );
}

/** Collects every distinct value per field, in the order first seen (D43). */
function summarise(
  entries: readonly CalendarEntry[]
): Readonly<Record<string, readonly CalendarValue[]>> {
  const summary = new Map<string, CalendarValue[]>();
  for (const entry of entries) {
    for (const [field, value] of Object.entries(entry.values)) {
      const seen = summary.get(field) ?? [];
      for (const candidate of toValues(value)) {
        // Distinct, never reduced: two entries disagreeing about a day is a
        // fact about the day, not a conflict to resolve by picking a winner.
        if (!seen.includes(candidate)) seen.push(candidate);
      }
      summary.set(field, seen);
    }
  }
  return Object.fromEntries(summary);
}

/**
 * Builds the calendar's day cells for a range.
 *
 * Reads only: nothing here writes to a file or mutates its input (D33). The
 * result is derived entirely from the entries passed in, so it rebuilds
 * identically from a fresh listing with no cache.
 */
export function aggregateCalendarDays(
  entries: readonly CalendarEntry[],
  range: CalendarRange,
  filter: CalendarFilter,
  status: CalendarStatus = "ready"
): CalendarAggregate {
  // Selection picks what the popout lists; it must not empty the grid (D59).
  const matching = entries.filter((entry) => matchesPredicates(entry, filter.predicates));

  const byDay = new Map<string, DatedEntry[]>();
  const undated: CalendarEntry[] = [];
  for (const entry of matching) {
    if (!isDated(entry)) {
      undated.push(entry);
      continue;
    }
    const key = formatJournalDate(entry.ref.date);
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }

  const days = eachDay(range).map((date): CalendarDay => {
    const found = byDay.get(formatJournalDate(date)) ?? [];
    // A cell that is still loading, or whose folder failed to read, has nothing
    // to show — reporting a stale count would be worse than reporting none.
    const dayEntries = status === "ready" ? [...found].sort(byChronology) : [];
    const count = dayEntries.length;

    return {
      date,
      state: status === "ready" ? (count > 0 ? "has-entries" : "empty") : status,
      entries: dayEntries,
      count,
      visibleDots: Math.min(count, MAX_DOTS),
      overflow: Math.max(count - MAX_DOTS, 0),
      values: summarise(dayEntries),
      diagnostics: dayEntries.flatMap((entry) => entry.diagnostics ?? [])
    };
  });

  return { days, undated: status === "ready" ? undated : [], status };
}
