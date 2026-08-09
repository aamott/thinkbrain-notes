import { fieldChoices, type JournalFieldDefinition, type JournalFieldValue } from "@thinkbrain/core";
import { useState } from "react";

/**
 * One metadata field, shared by the desktop dateline and the phone sheet (D40).
 *
 * One implementation, two densities: the sheet is only ever reached by a
 * fingertip, so its controls clear the 44px touch minimum, while the dateline
 * stays compact under a mouse. The behaviour is identical either way — the
 * value is reported the moment it changes and nothing is written here.
 */

export type MetadataFieldSize = "compact" | "touch";

export interface MetadataFieldProps {
  readonly definition: JournalFieldDefinition;
  readonly value: JournalFieldValue | undefined;
  readonly size?: MetadataFieldSize;
  /** `undefined` clears the field rather than writing an empty value. */
  readonly onSet: (value: JournalFieldValue | undefined) => void;
}

const PILL = "rounded-full border text-[0.72rem] cursor-pointer";
const PILL_SIZE: Record<MetadataFieldSize, string> = {
  compact: "px-2 py-0.5",
  touch: "min-h-11 px-3.5"
};
const INPUT = "rounded-small border border-input bg-background px-2 text-foreground";
const INPUT_SIZE: Record<MetadataFieldSize, string> = {
  compact: "h-7 text-xs",
  touch: "h-11 text-sm"
};

export function MetadataField({ definition, value, size = "compact", onSet }: MetadataFieldProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const pill = `${PILL} ${PILL_SIZE[size]}`;

  // D83: what this note says, healed. A value the options no longer contain is
  // offered here and nowhere else — it never travels back into the definition.
  const choices = fieldChoices(definition, value);
  const selected = choices.selected;
  const multi = definition.type === "multi-select";

  /** D84: records a value on this note; the field's options are untouched. */
  const commit = (): void => {
    const text = draft.trim();
    setDraft("");
    setAdding(false);
    if (text === "") return;
    if (multi) {
      onSet(selected.includes(text) ? selected : [...selected, text]);
      return;
    }
    onSet(text);
  };

  return (
    <fieldset className="m-0 grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 border-0 p-0">
      <legend className="sr-only">{definition.label}</legend>
      <span aria-hidden="true" className="text-[0.7rem] text-muted-foreground">
        {definition.label}
      </span>

      {definition.type === "single-select" || definition.type === "multi-select" ? (
        <span className="flex flex-wrap gap-1">
          {choices.options.map((option) => {
            const on = selected.includes(option);
            const extra = choices.extras.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                aria-label={`${definition.label}: ${option}`}
                title={
                  extra
                    ? `"${option}" isn't one of the choices for ${definition.label}; it's only on this entry.`
                    : undefined
                }
                onClick={() => {
                  if (multi) {
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
                className={[
                  pill,
                  on
                    ? "border-transparent bg-accent font-semibold text-accent-foreground"
                    : "border-border text-muted-foreground",
                  // Dashed, not coloured: this is "yours alone", not "wrong",
                  // and D4 keeps us out of judging anybody's vocabulary.
                  extra ? "border-dashed" : ""
                ].join(" ")}
              >
                {option}
              </button>
            );
          })}

          {adding ? (
            <input
              autoFocus
              aria-label={`New value for ${definition.label}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setDraft("");
                  setAdding(false);
                }
              }}
              className={`${INPUT} ${INPUT_SIZE[size]} w-32`}
            />
          ) : (
            <button
              type="button"
              aria-label={`Add a value to ${definition.label}`}
              onClick={() => setAdding(true)}
              className={`${pill} border-dashed border-border text-muted-foreground`}
            >
              ＋
            </button>
          )}
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
          className={`${INPUT} ${INPUT_SIZE[size]}`}
        />
      )}
    </fieldset>
  );
}
