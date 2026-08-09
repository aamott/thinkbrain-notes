import type {
  JournalDate,
  JournalFieldDefinition,
  JournalFieldValue,
  NoteDiagnostic
} from "@thinkbrain/core";
import { useState } from "react";

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

function formatValue(value: JournalFieldValue): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

const PILL = "rounded-full border px-2 py-0.5 text-[0.72rem] cursor-pointer";

function Field({
  definition,
  value,
  onSet
}: {
  readonly definition: JournalFieldDefinition;
  readonly value: JournalFieldValue | undefined;
  readonly onSet: (value: JournalFieldValue | undefined) => void;
}) {
  const selected = definition.type === "multi-select" && Array.isArray(value) ? value : [];

  return (
    <fieldset className="m-0 grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 border-0 p-0">
      <legend className="sr-only">{definition.label}</legend>
      <span aria-hidden="true" className="text-[0.7rem] text-muted-foreground">
        {definition.label}
      </span>

      {definition.type === "single-select" || definition.type === "multi-select" ? (
        <span className="flex flex-wrap gap-1">
          {definition.options?.map((option) => {
            const on =
              definition.type === "multi-select" ? selected.includes(option) : value === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                aria-label={`${definition.label}: ${option}`}
                onClick={() => {
                  if (definition.type === "multi-select") {
                    const next = on
                      ? selected.filter((entry) => entry !== option)
                      : [...selected, option];
                    onSet(next.length > 0 ? next : undefined);
                  } else {
                    // Choosing the current option again clears it; there is no
                    // other way to unset a single-select without a stray "none".
                    onSet(on ? undefined : option);
                  }
                }}
                className={
                  on
                    ? `${PILL} border-transparent bg-accent font-semibold text-accent-foreground`
                    : `${PILL} border-border text-muted-foreground`
                }
              >
                {option}
              </button>
            );
          })}
        </span>
      ) : (
        <input
          type={definition.type === "number" ? "number" : "text"}
          aria-label={definition.label}
          value={value === undefined ? "" : String(value)}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw.trim() === "") {
              onSet(undefined);
              return;
            }
            if (definition.type === "number") {
              const parsed = Number(raw);
              onSet(Number.isFinite(parsed) ? parsed : undefined);
              return;
            }
            onSet(raw);
          }}
          className="h-7 rounded-small border border-input bg-background px-2 text-xs text-foreground"
        />
      )}
    </fieldset>
  );
}

export function MetadataWidget({
  date,
  definitions,
  values,
  diagnostics,
  onSet
}: MetadataWidgetProps) {
  const [expanded, setExpanded] = useState(false);
  const set = definitions
    .filter((definition) => values[definition.id] !== undefined)
    .map((definition) => formatValue(values[definition.id]!));

  const notice = diagnostics.find(
    (diagnostic) =>
      diagnostic.code === "journal_date_mismatch" || diagnostic.code.startsWith("frontmatter")
  );

  return (
    <div className="mx-auto max-w-[34rem] px-5 pt-4">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border pb-2">
        <span className="text-[0.82rem] font-semibold">{formatLongDate(date)}</span>
        {!expanded && set.length > 0 && (
          <span className="text-[0.82rem] text-muted-foreground">· {set.join(" · ")}</span>
        )}
        {definitions.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="ml-auto rounded-small border border-border px-1.5 text-[0.68rem] text-muted-foreground cursor-pointer hover:text-foreground"
          >
            {expanded ? "Done" : set.length > 0 ? "Edit" : "Add metadata"}
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

      {expanded && (
        <div className="flex flex-col gap-2 border-b border-border py-3">
          {definitions.map((definition) => (
            <Field
              key={definition.id}
              definition={definition}
              value={values[definition.id]}
              onSet={(value) => onSet(definition.id, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
