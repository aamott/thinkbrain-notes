import type { JournalFieldDefinition, JournalFieldValue } from "@thinkbrain/core";

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
  const selected = definition.type === "multi-select" && Array.isArray(value) ? value : [];
  const pill = `${PILL} ${PILL_SIZE[size]}`;

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
                    ? `${pill} border-transparent bg-accent font-semibold text-accent-foreground`
                    : `${pill} border-border text-muted-foreground`
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
          className={`${INPUT} ${INPUT_SIZE[size]}`}
        />
      )}
    </fieldset>
  );
}
