import type { NoteDiagnostic } from "../note-model";
import type {
  JournalDate,
  JournalEntryRef,
  JournalFieldDefinition,
  JournalFieldType,
  JournalFieldValue
} from "./types";

/**
 * Journal frontmatter helpers.
 *
 * Reading is lenient and never repairs (D50): a note is parsed, described, and
 * handed back with everything it already contained. Nothing here writes to a
 * file — callers write only in response to an explicit user edit, and then only
 * the keys that changed.
 */

/** The journal's date key (D48). Reserved: no user-defined field may use it. */
export const JOURNAL_DATE_KEY = "date";

/** Keys the note model already owns, which a journal field may not shadow (D48). */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  JOURNAL_DATE_KEY,
  "title",
  "tags",
  "aliases",
  "status",
  "created_at",
  "updated_at"
]);

const FIELD_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;
const FIELD_TYPES: ReadonlySet<string> = new Set([
  "text",
  "single-select",
  "number",
  "multi-select"
]);
const SELECT_TYPES: ReadonlySet<string> = new Set(["single-select", "multi-select"]);
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const warning = (code: string, message: string): NoteDiagnostic => ({
  code,
  message,
  severity: "warning"
});

/** Formats a date as the plain `YYYY-MM-DD` string the journal writes (D48). */
export function formatJournalDate(date: JournalDate): string {
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${date.year}-${month}-${day}`;
}

/**
 * Builds the frontmatter for a brand-new entry.
 *
 * The date and nothing else (D22): no configured field is pre-seeded, so the
 * file stays clean until the user sets something.
 */
export function buildNewEntryFrontmatter(date: JournalDate): Record<string, string> {
  return { [JOURNAL_DATE_KEY]: formatJournalDate(date) };
}

export interface ResolvedEntryDate {
  /** Always the filename's date, which wins on conflict (D20). */
  readonly date: JournalDate;
  readonly diagnostics: readonly NoteDiagnostic[];
}

function parseIsoDate(value: string): JournalDate | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function sameDate(left: JournalDate, right: JournalDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

/**
 * Resolves an entry's date from its filename and frontmatter.
 *
 * The filename always wins (D20). A frontmatter date that disagrees or cannot be
 * read is reported and left exactly as the user wrote it: silent repair would
 * edit a file the user only asked us to open.
 */
export function resolveEntryDate(
  ref: JournalEntryRef,
  metadata: Readonly<Record<string, unknown>>
): ResolvedEntryDate {
  const raw = metadata[JOURNAL_DATE_KEY];
  if (raw === undefined || raw === null) return { date: ref.date, diagnostics: [] };

  const parsed = typeof raw === "string" ? parseIsoDate(raw) : null;
  if (!parsed) {
    return {
      date: ref.date,
      diagnostics: [
        warning(
          "journal_date_unreadable",
          `The ${JOURNAL_DATE_KEY} in this note could not be read; the filename date is used.`
        )
      ]
    };
  }

  if (!sameDate(parsed, ref.date)) {
    return {
      date: ref.date,
      diagnostics: [
        warning(
          "journal_date_mismatch",
          `This note's ${JOURNAL_DATE_KEY} (${raw}) disagrees with its filename (${formatJournalDate(ref.date)}); the filename is used.`
        )
      ]
    };
  }

  return { date: ref.date, diagnostics: [] };
}

export interface FieldDefinitionResult {
  readonly definition: JournalFieldDefinition | null;
  readonly diagnostics: readonly NoteDiagnostic[];
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Validates one user-defined field definition against D49. */
export function validateFieldDefinition(value: unknown): FieldDefinitionResult {
  const reject = (code: string, message: string): FieldDefinitionResult => ({
    definition: null,
    diagnostics: [warning(code, message)]
  });

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return reject("journal_field_malformed", "A metadata field must be an object.");
  }

  const candidate = value as Record<string, unknown>;
  const { id, label, type, options } = candidate;

  if (typeof id !== "string" || !FIELD_ID_PATTERN.test(id)) {
    return reject(
      "journal_field_id_invalid",
      `Metadata field id "${String(id)}" must be lowercase and start with a letter.`
    );
  }
  if (RESERVED_KEYS.has(id)) {
    return reject("journal_field_reserved", `"${id}" is reserved and cannot be a metadata field.`);
  }
  if (typeof label !== "string" || label.trim() === "") {
    return reject("journal_field_label_missing", `Metadata field "${id}" needs a label.`);
  }
  if (typeof type !== "string" || !FIELD_TYPES.has(type)) {
    return reject(
      "journal_field_type_invalid",
      `Metadata field "${id}" has an unknown type "${String(type)}".`
    );
  }

  const isSelect = SELECT_TYPES.has(type);
  if (isSelect && !isStringArray(options)) {
    return reject("journal_field_options_missing", `Metadata field "${id}" needs a list of options.`);
  }
  if (!isSelect && options !== undefined) {
    return reject(
      "journal_field_options_unexpected",
      `Metadata field "${id}" is a ${type} field and cannot have options.`
    );
  }

  return {
    definition: {
      id,
      label,
      type: type as JournalFieldType,
      ...(isSelect ? { options: options as readonly string[] } : {})
    },
    diagnostics: []
  };
}

export interface JournalMetadataResult {
  /** Values that matched their field's declared shape. */
  readonly values: Readonly<Record<string, JournalFieldValue>>;
  /** Values that contradicted their field's shape, kept exactly as written (D50). */
  readonly invalid: Readonly<Record<string, unknown>>;
  /**
   * Keys with no matching definition, kept verbatim (D33, D45).
   *
   * A removed definition and a key written by another tool are indistinguishable
   * from the file alone, so they share one bucket. Either way the value stays.
   */
  readonly unconfigured: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly NoteDiagnostic[];
}

/** Returns the value if it matches the field's declared shape, otherwise `null`. */
function matchingValue(
  definition: JournalFieldDefinition,
  raw: unknown
): JournalFieldValue | null {
  switch (definition.type) {
    case "number":
      return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    case "text":
      return typeof raw === "string" ? raw : null;
    case "single-select":
      return typeof raw === "string" && definition.options?.includes(raw) ? raw : null;
    case "multi-select":
      return isStringArray(raw) && raw.every((entry) => definition.options?.includes(entry))
        ? raw
        : null;
  }
}

/**
 * Reads a note's frontmatter against the configured fields.
 *
 * Every key is accounted for and none is discarded: what does not fit is
 * reported, not coerced and not dropped (D50).
 */
export function readJournalMetadata(
  metadata: Readonly<Record<string, unknown>>,
  definitions: readonly JournalFieldDefinition[]
): JournalMetadataResult {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const values: Record<string, JournalFieldValue> = {};
  const invalid: Record<string, unknown> = {};
  const unconfigured: Record<string, unknown> = {};
  const diagnostics: NoteDiagnostic[] = [];

  for (const [key, raw] of Object.entries(metadata)) {
    if (RESERVED_KEYS.has(key)) continue;

    const definition = byId.get(key);
    if (!definition) {
      unconfigured[key] = raw;
      diagnostics.push(
        warning(
          "journal_field_unconfigured",
          `"${key}" is not a configured metadata field; its value is kept as written.`
        )
      );
      continue;
    }

    const value = matchingValue(definition, raw);
    if (value === null) {
      invalid[key] = raw;
      diagnostics.push(
        warning(
          "journal_field_invalid",
          `"${key}" does not match its ${definition.type} field; its value is kept as written.`
        )
      );
      continue;
    }

    values[key] = value;
  }

  return { values, invalid, unconfigured, diagnostics };
}
