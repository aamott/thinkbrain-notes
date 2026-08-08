import { useState } from "react";

import { registerControl, type ControlProps } from "../settings/controlRegistry";
import { FIELD_DEFINITIONS_CONTROL, parseFieldDefinitions } from "./journalSettings";

/**
 * Editor for the journal's user-defined metadata fields (D49).
 *
 * The definitions are stored as a JSON array in one `string` setting, so this
 * control is a text editor with a validating summary rather than a form
 * builder. It refuses to save an edit that does not parse: a broken definition
 * would strand every value it describes, and the setting is the only thing
 * telling the app what those keys mean.
 */
export function JournalFieldDefinitionsControl({
  definition,
  value,
  onChange,
  disabled
}: ControlProps) {
  const stored = typeof value === "string" ? value : "[]";
  const [draft, setDraft] = useState(stored);
  const [lastStored, setLastStored] = useState(stored);

  // Follow an external change — a workspace switch, or Reset — by adjusting
  // state during render rather than in an effect, so the new value renders in
  // the same pass instead of flashing the old one first.
  if (stored !== lastStored) {
    setLastStored(stored);
    setDraft(stored);
  }

  const { definitions, diagnostics } = parseFieldDefinitions(draft);
  const invalid = diagnostics.length > 0;

  const edit = (next: string): void => {
    setDraft(next);
    if (parseFieldDefinitions(next).diagnostics.length === 0) onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="w-full min-h-[7rem] font-mono text-xs bg-input text-foreground border border-border rounded p-2"
        aria-label={`${definition.label}, JSON`}
        spellCheck={false}
        disabled={disabled}
        value={draft}
        onChange={(event) => edit(event.target.value)}
      />

      {invalid ? (
        <ul className="m-0 p-0 list-none text-danger text-xs" role="alert">
          {diagnostics.map((diagnostic) => (
            <li key={`${diagnostic.code}:${diagnostic.message}`}>{diagnostic.message}</li>
          ))}
        </ul>
      ) : definitions.length === 0 ? (
        <p className="m-0 text-muted-foreground text-xs">
          No metadata fields yet. Add one to record it on an entry.
        </p>
      ) : (
        <ul className="m-0 p-0 list-none text-muted-foreground text-xs">
          {definitions.map((field) => (
            <li key={field.id}>
              {field.label} — {field.type}
              {field.options ? ` (${field.options.join(", ")})` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Makes the control available to the settings UI.
 *
 * Called once during journal activation; the schema alone is not enough,
 * because a `control` key with nothing registered falls back to a plain text
 * box and warns.
 */
export function registerJournalControls(): void {
  registerControl(FIELD_DEFINITIONS_CONTROL, JournalFieldDefinitionsControl);
}
