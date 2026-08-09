import type {
  JournalDate,
  JournalFieldDefinition,
  JournalFieldValue,
  NoteDiagnostic
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
  /** Anything noticed while reading the note; shown, never acted on (D33). */
  readonly diagnostics: readonly NoteDiagnostic[];
  /** `undefined` clears the field rather than writing an empty value. */
  readonly onSet: (fieldId: string, value: JournalFieldValue | undefined) => void;
}

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
] as const;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
] as const;

/**
 * `Friday, August 7, 2026` (D74).
 *
 * The year stays: the frontmatter date is the backup record if a file is
 * renamed, so it has to be readable on the page.
 */
function formatLongDate(date: JournalDate): string {
  const weekday = WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()];
  return `${weekday}, ${MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}

/**
 * `Friday, August 7` — the sheet's own name (D78).
 *
 * No year: the dateline behind the sheet is still carrying it, and a dialog
 * name is read aloud every time focus enters.
 */
function formatSheetDate(date: JournalDate): string {
  const weekday = WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()];
  return `${weekday}, ${MONTHS[date.month - 1]} ${date.day}`;
}

function formatValue(value: JournalFieldValue): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function MetadataWidget({
  date,
  definitions,
  unconfigured = [],
  onDefineField,
  values,
  diagnostics,
  onSet
}: MetadataWidgetProps) {
  const [expanded, setExpanded] = useState(false);
  // Fields named on this entry (D86). They hold no value until one is typed, so
  // naming a field never puts a key in the file on its own.
  const [added, setAdded] = useState<readonly JournalFieldDefinition[]>([]);
  // D76: touch decides. Under a fingertip the fields move into a sheet (M-2),
  // because the dateline's compact controls are half the touch minimum and sit
  // where the soft keyboard would cover them.
  const touch = useCoarsePointer();
  const shown = [...definitions, ...unconfigured, ...added];
  const set = shown
    .filter((definition) => values[definition.id] !== undefined)
    .map((definition) => formatValue(values[definition.id]!));

  const notice = diagnostics.find(
    (diagnostic) =>
      diagnostic.code === "journal_date_mismatch" || diagnostic.code.startsWith("frontmatter")
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
    />
  );

  return (
    <div className="mx-auto max-w-[34rem] px-5 pt-4">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border pb-2">
        <span className="text-[0.82rem] font-semibold">{formatLongDate(date)}</span>
        {!expanded && set.length > 0 && (
          <span className="text-[0.82rem] text-muted-foreground">· {set.join(" · ")}</span>
        )}
        {shown.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="ml-auto rounded-small border border-border px-1.5 text-[0.68rem] text-muted-foreground cursor-pointer hover:text-foreground"
          >
            {/* The sheet carries its own Done, so the opener keeps its label. */}
            {expanded && !touch ? "Done" : set.length > 0 ? "Edit" : "Add metadata"}
          </button>
        )}
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
              />
              {unconfigured.includes(definition) && (
                <span className="pl-[7.5rem] text-[0.68rem] text-muted-foreground">
                  Not one of your fields yet.{" "}
                  {onDefineField && (
                    <button
                      type="button"
                      aria-label={`Add ${definition.id} to your fields`}
                      onClick={() => onDefineField(definition)}
                      className="border-0 bg-transparent p-0 text-[0.68rem] text-muted-foreground underline underline-offset-2 cursor-pointer hover:text-foreground"
                    >
                      Add it
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
          {addRow}
        </div>
      )}

      {expanded && touch && (
        <MetadataBottomSheet
          title={formatSheetDate(date)}
          definitions={shown}
          values={values}
          onSet={onSet}
          onDismiss={() => setExpanded(false)}
        >
          {addRow}
        </MetadataBottomSheet>
      )}
    </div>
  );
}
