/**
 * Platform-agnostic journal types.
 *
 * A journal entry is an ordinary Markdown note (D2). Nothing here encodes a
 * mood scale, an activity taxonomy, or any other vocabulary: metadata fields
 * are user-defined (D4), so their values are opaque strings, numbers, and
 * string lists as far as this module is concerned.
 */

/** A calendar date in the user's local time (D19). Months and days are 1-based. */
export interface JournalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** An entry identified by its filename, which is authoritative on conflict (D20). */
export interface JournalEntryRef {
  readonly date: JournalDate;
  /**
   * Minutes since local midnight, or `null` for a date-only entry whose time is
   * unknown. Date-only entries sort before timed entries on the same day (D42).
   */
  readonly minuteOfDay: number | null;
  /** Same-minute collision counter, always `>= 2`, or `null` when absent (D30). */
  readonly counter: number | null;
}

/** The four input types a user-defined metadata field may declare (D4). */
export type JournalFieldType = "text" | "single-select" | "number" | "multi-select";

/**
 * A user-defined metadata field (D49).
 *
 * `id` is the literal frontmatter key, so what the user configures is what they
 * see in the file (D3).
 */
export interface JournalFieldDefinition {
  readonly id: string;
  readonly label: string;
  readonly type: JournalFieldType;
  /** Required for the select types, forbidden otherwise. */
  readonly options?: readonly string[];
}

/** A metadata value, shaped by its field's type (D49). */
export type JournalFieldValue = string | number | readonly string[];
