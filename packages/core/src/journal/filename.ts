import type { JournalDate, JournalEntryRef } from "./types";

/**
 * Journal filename parsing, per D42.
 *
 * Read leniently within a narrow family, write one format (D33): the parser
 * accepts the three year-first fixed-width forms and nothing else. Anything
 * else is UNDATED — the app never guesses a date (D38), because a wrong guess
 * silently misfiles the entry somewhere the user will not think to look.
 */

/** A filename that carries no unambiguous date. */
export const UNDATED = Symbol.for("thinkbrain.journal.undated");

export type JournalFilenameResult = JournalEntryRef | typeof UNDATED;

/**
 * `YYYY-MM-DD` optionally followed by `-HHmm`, optionally followed by `-N`.
 * Every component is fixed-width and zero-padded except the counter.
 */
const FILENAME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2})(?:-(\d+))?)?\.md$/;

/** Rejects a date the calendar does not have, such as 2026-02-30. */
function isRealDate({ year, month, day }: JournalDate): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** Strips any directory prefix so callers may pass a path or a bare filename. */
function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

/**
 * Parses a journal filename.
 *
 * @param path A filename or workspace-relative path.
 * @returns The entry reference, or {@link UNDATED} when the name is outside D42.
 */
export function parseJournalFilename(path: string): JournalFilenameResult {
  const match = FILENAME_PATTERN.exec(basename(path));
  if (!match) return UNDATED;

  const [, year, month, day, hours, minutes, counter] = match;
  const date: JournalDate = { year: Number(year), month: Number(month), day: Number(day) };
  if (!isRealDate(date)) return UNDATED;

  if (hours === undefined || minutes === undefined) {
    return { date, minuteOfDay: null, counter: null };
  }

  const hour = Number(hours);
  const minute = Number(minutes);
  if (hour > 23 || minute > 59) return UNDATED;

  // A counter of 0 or 1 is not a form the writer ever emits, so accepting one
  // would mean inventing a meaning for a filename nobody agreed on.
  const collision = counter === undefined ? null : Number(counter);
  if (collision !== null && collision < 2) return UNDATED;

  return { date, minuteOfDay: hour * 60 + minute, counter: collision };
}

/** Orders entries chronologically; a date-only entry precedes timed ones (D42). */
export function compareJournalEntries(left: JournalEntryRef, right: JournalEntryRef): number {
  return (
    left.date.year - right.date.year ||
    left.date.month - right.date.month ||
    left.date.day - right.date.day ||
    // Unknown time sorts first, so it cannot collide with real midnight.
    (left.minuteOfDay ?? -1) - (right.minuteOfDay ?? -1) ||
    (left.counter ?? 0) - (right.counter ?? 0)
  );
}
