import { formatJournalDate } from "./frontmatter";
import type { JournalDate } from "./types";

/**
 * Journal path expansion, per D17 and D30.
 *
 * Pure and platform-agnostic: given the configured root, a date, a time, and
 * the paths already in use, it returns the one path a new entry should take.
 * The writer only ever emits this form, however leniently the reader accepts
 * others (D33).
 */

const MINUTES_PER_DAY = 24 * 60;

/** Trims a configured root to a bare relative folder, rejecting an escape. */
export function normalizeRoot(root: string): string {
  const trimmed = root.trim().replace(/^[/\\]+/, "").replace(/[/\\]+$/, "");
  if (trimmed === "") {
    throw new Error("The journal root must be a non-empty workspace-relative folder.");
  }
  if (trimmed.split(/[\\/]/).includes("..")) {
    throw new Error(`Journal root "${root}" must stay inside the workspace.`);
  }
  return trimmed.replace(/\\/g, "/");
}

/** Returns the `root/YYYY/MM` folder an entry for this date belongs in (D17). */
export function journalEntryFolder(root: string, date: JournalDate): string {
  const month = String(date.month).padStart(2, "0");
  return `${normalizeRoot(root)}/${date.year}/${month}`;
}

/** Formats `HHmm` from minutes since midnight. */
function formatMinuteOfDay(minuteOfDay: number): string {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= MINUTES_PER_DAY) {
    throw new Error(`Minute of day ${minuteOfDay} is outside 0-${MINUTES_PER_DAY - 1}.`);
  }
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const minutes = String(minuteOfDay % 60).padStart(2, "0");
  return `${hours}${minutes}`;
}

export interface NewEntryPathOptions {
  /** Configured journal root, workspace-relative (D7). */
  readonly root: string;
  readonly date: JournalDate;
  /** Minutes since local midnight; always written, never omitted (D17). */
  readonly minuteOfDay: number;
  /** Workspace-relative paths already in use. */
  readonly taken: Iterable<string>;
}

/**
 * Resolves the path for a new entry, adding a counter suffix on collision.
 *
 * Counters start at 2 and fill the lowest free slot (D30): a deleted `-2` is
 * reused rather than skipped, because the counter disambiguates a filename, it
 * does not number the entries.
 */
export function resolveNewEntryPath(options: NewEntryPathOptions): string {
  const folder = journalEntryFolder(options.root, options.date);
  const stem = `${formatJournalDate(options.date)}-${formatMinuteOfDay(options.minuteOfDay)}`;
  const used = new Set(options.taken);

  const candidate = `${folder}/${stem}.md`;
  if (!used.has(candidate)) return candidate;

  for (let counter = 2; ; counter += 1) {
    const next = `${folder}/${stem}-${counter}.md`;
    if (!used.has(next)) return next;
  }
}
