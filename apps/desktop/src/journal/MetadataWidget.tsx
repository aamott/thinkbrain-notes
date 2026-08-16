import {
  fieldChoices,
  journalWeekday,
  MONTHS,
  type JournalDate,
  type JournalFieldDefinition,
  type JournalFieldValue,
  type NoteDiagnostic
} from "@thinkbrain/core";
import { useState } from "react";

import { AddFieldRow } from "./AddFieldRow";
import { MetadataBottomSheet } from "./MetadataBottomSheet";
import { MetadataField } from "./MetadataField";
import { useCoarsePointer } from "./useCoarsePointer";

/**
 * The entry's metadata, set as the page's dateline (D35).
 *
 * Collapsed by default (D24): the summary and the affordance are the same
 * object. With nothing recorded it is only the date (D54) — the commonest entry
 * has no metadata, and it should look finished rather than unfilled.
 *
 * Presentational. It reports what the user set and never writes: the container
 * owns the file, and writes only the key that changed (D50).
 */

export interface MetadataWidgetProps {
  /** From the filename, which is authoritative (D20). */
  readonly date: JournalDate;
  readonly definitions: readonly JournalFieldDefinition[];
  readonly values: Readonly<Record<string, JournalFieldValue>>;
  /**
   * Fields invented for keys the note uses and the settings do not know (D85).
   * Editable like any other; marked, because they are not yours yet.
   */
  readonly unconfigured?: readonly JournalFieldDefinition[];
  /** Promotes one of those keys into a configured field. Omitted where the
   * host cannot write settings. */
  readonly onDefineField?: (definition: JournalFieldDefinition) => void;
  /**
   * Adds a value to a configured select field's options. Called when the user
   * promotes an extra (a value on the note that isn't in the definition's
   * options) into the field's vocabulary. Omitted where the host cannot write
   * settings.
   */
  readonly onAddOption?: (fieldId: string, option: string) => void;
  /** Anything noticed while reading the note; shown, never acted on (D33). */
  readonly diagnostics: readonly NoteDiagnostic[];
  /** `undefined` clears the field rather than writing an empty value. */
  readonly onSet: (fieldId: string, value: JournalFieldValue | undefined) => void;
  /** Disables all editable controls when true (e.g., when there is no write path). */
  readonly readOnly?: boolean;
}

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
] as const;

/**
 * `Friday, August 7, 2026` (D74) or `Friday, August 7` (D78).
 *
 * One function for both spellings: the dateline keeps the year (the frontmatter
 * date is the backup record if a file is renamed), the sheet's own name drops
 * it because the dateline behind it is still carrying it and a dialog name is
 * read aloud every time focus enters.
 */
function formatJournalLongDate(date: JournalDate, withYear: boolean): string {
  const weekday = WEEKDAYS[journalWeekday(date)];
  const base = `${weekday}, ${MONTHS[date.month - 1]} ${date.day}`;
  return withYear ? `${base}, ${date.year}` : base;
}

function formatValue(value: JournalFieldValue): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

const AFFORDANCE_LINK =
  "border-0 bg-transparent p-0 text-[0.68rem] text-muted-foreground underline underline-offset-2 cursor-pointer hover:text-foreground";

/**
 * The "Add it" affordances under a field — promoting an unconfigured key, or
 * adding an extra value as an option. Shared by the desktop dateline and the
 * touch bottom sheet so the two paths cannot drift apart.
 */
export interface FieldAffordancesProps {
  readonly definition: JournalFieldDefinition;
  readonly value: JournalFieldValue | undefined;
  readonly isUnconfigured: boolean;
  readonly readOnly: boolean;
  readonly onDefineField?: (definition: JournalFieldDefinition) => void;
  readonly onAddOption?: (fieldId: string, option: string) => void;
  /** Left padding to align with the field's value column (desktop only). */
  readonly pad?: string;
}

export function FieldAffordances({
  definition,
  value,
  isUnconfigured,
  readOnly,
  onDefineField,
  onAddOption,
  pad = ""
}: FieldAffordancesProps) {
  const extras = fieldChoices(definition, value).extras;
  return (
    <>
      {isUnconfigured && (
        <span className={`${pad} text-[0.68rem] text-muted-foreground`}>
          Not one of your fields yet.{" "}
          {onDefineField && (
            <button
              type="button"
              aria-label={`Add ${definition.id} to your fields`}
              onClick={() => onDefineField(definition)}
              className={AFFORDANCE_LINK}
            >
              Add it
            </button>
          )}
        </span>
      )}
      {extras.length > 0 && onAddOption && !readOnly && (
        <span className={`${pad} text-[0.68rem] text-muted-foreground`}>
          {extras.map((extra) => (
            <span key={extra}>
              &ldquo;{extra}&rdquo; isn&rsquo;t one of the choices.{" "}
              <button
                type="button"
                aria-label={`Add ${extra} as an option for ${definition.label}`}
                onClick={() => onAddOption(definition.id, extra)}
                className={AFFORDANCE_LINK}
              >
                Add it
              </button>
              {" "}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

export function MetadataWidget({
  date,
  definitions,
  unconfigured = [],
  onDefineField,
  onAddOption,
  values,
  diagnostics,
  onSet,
  readOnly = false
}: MetadataWidgetProps) {
  const [expanded, setExpanded] = useState(false);
  // Fields named on this entry (D86). They hold no value until one is typed, so
  // naming a field never puts a key in the file on its own.
  const [added, setAdded] = useState<readonly JournalFieldDefinition[]>([]);
  // D76: touch decides. Under a fingertip the fields move into a sheet (M-2),
  // because the dateline's compact controls are half the touch minimum and sit
  // where the soft keyboard would cover them.
  const touch = useCoarsePointer();
  // `added` fields are local state — they exist only until a value is typed and
  // the key reaches the frontmatter. Once it does, the container re-parses the
  // file and the field arrives via `unconfigured` (or `definitions` if it was a
  // configured field the entry wasn't showing yet). Without deduplication the
  // same field renders twice: once from `added` and once from `unconfigured`,
  // both reading the same `values[id]` and mirroring each other as the user
  // types.
  const knownIds = new Set<string>([
    ...definitions.map((d) => d.id),
    ...unconfigured.map((d) => d.id)
  ]);
  const addedShown = added.filter((field) => !knownIds.has(field.id));
  const shown = [...definitions, ...unconfigured, ...addedShown];
  const set = shown
    .filter((definition) => values[definition.id] !== undefined)
    .map((definition) => formatValue(values[definition.id]!));

  const notice = diagnostics.find(
    (diagnostic) =>
      diagnostic.code === "journal_date_mismatch" ||
      diagnostic.code === "journal_date_unreadable" ||
      diagnostic.code.startsWith("frontmatter")
  );

  const addRow = (
    <AddFieldRow
      // Everything configured is already on screen, so there is nothing of the
      // user's left to offer here — only naming something new.
      available={definitions.filter(
        (definition) => !shown.some((entry) => entry.id === definition.id)
      )}
      existingKeys={shown.map((definition) => definition.id)}
      onAdd={(field) => setAdded((current) => [...current, field])}
      readOnly={readOnly}
    />
  );

  return (
    <div className="mx-auto max-w-136 px-5 pt-4">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border pb-2">
        <span className="text-[0.82rem] font-semibold">{formatJournalLongDate(date, true)}</span>
        {!expanded && set.length > 0 && (
          <span className="text-[0.82rem] text-muted-foreground">· {set.join(" · ")}</span>
        )}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="ml-auto rounded-small border border-border px-1.5 text-[0.68rem] text-muted-foreground cursor-pointer hover:text-foreground"
        >
          {/* The sheet carries its own Done, so the opener keeps its label. */}
          {expanded && !touch ? "Done" : "Info Tracker"}
        </button>
      </div>

      {notice && (
        <p role="status" className="m-0 border-b border-border py-2 text-[0.72rem]">
          <span className="font-semibold">
            {notice.code === "journal_date_mismatch"
              ? "This note's date disagrees with its filename."
              : "This note's frontmatter couldn't be read."}
          </span>{" "}
          {/* Reported, never repaired: opening a note is not permission to
              write to it (D33/D50). */}
          <span className="text-muted-foreground">
            {notice.code === "journal_date_mismatch"
              ? `${notice.message} Nothing has been changed.`
              : "It's still an entry and nothing has been changed."}
          </span>
        </p>
      )}

      {expanded && !touch && (
        <div className="flex flex-col gap-2 border-b border-border py-3">
          {shown.map((definition) => (
            <div key={definition.id} className="flex flex-col gap-0.5">
              <MetadataField
                definition={definition}
                value={values[definition.id]}
                onSet={(value) => onSet(definition.id, value)}
                readOnly={readOnly}
              />
              <FieldAffordances
                definition={definition}
                value={values[definition.id]}
                isUnconfigured={unconfigured.includes(definition)}
                readOnly={readOnly}
                onDefineField={onDefineField}
                onAddOption={onAddOption}
                pad="pl-[7.5rem]"
              />
            </div>
          ))}
          {addRow}
        </div>
      )}

      {expanded && touch && (
        <MetadataBottomSheet
          title={formatJournalLongDate(date, false)}
          definitions={shown}
          values={values}
          onSet={onSet}
          onDismiss={() => setExpanded(false)}
          readOnly={readOnly}
          unconfigured={unconfigured}
          onDefineField={onDefineField}
          onAddOption={onAddOption}
        >
          {addRow}
        </MetadataBottomSheet>
      )}
    </div>
  );
}
