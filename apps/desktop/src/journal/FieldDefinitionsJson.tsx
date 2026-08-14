import { useState } from "react";

import { type ControlProps } from "../settings/controlRegistry";
import { parseFieldDefinitions } from "./journalSettings";

const LINK =
  "bg-transparent border-0 text-xs text-muted-foreground underline underline-offset-2 cursor-pointer hover:text-foreground";

/**
 * JSON textarea fallback for the journal field definitions control (D82).
 *
 * Self-contained: owns `jsonDraft`/`jsonError`, calls `onChange` with the raw
 * string on every valid parse. Shown when the stored value is unreadable by the
 * form, or when the user picks "Edit as JSON". `onBack` exits JSON mode.
 */
export function FieldDefinitionsJson({
  definition,
  stored,
  disabled,
  onChange,
  onBack
}: {
  readonly definition: ControlProps["definition"];
  readonly stored: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
  readonly onBack: () => void;
}) {
  const parsed = parseFieldDefinitions(stored);
  const unreadable = parsed.diagnostics.length > 0;
  const [jsonDraft, setJsonDraft] = useState(stored);
  const [jsonError, setJsonError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="min-h-[7rem] w-full rounded border border-border bg-input p-2 font-mono text-xs text-foreground"
        aria-label={`${definition.label}, JSON`}
        spellCheck={false}
        disabled={disabled}
        value={jsonDraft}
        onChange={(event) => {
          const next = event.target.value;
          setJsonDraft(next);
          const result = parseFieldDefinitions(next);
          if (result.diagnostics.length > 0) {
            setJsonError(result.diagnostics[0]?.message ?? "That isn't valid.");
            return;
          }
          setJsonError(null);
          onChange(next);
        }}
      />
      {(jsonError ?? (unreadable ? parsed.diagnostics[0]?.message : null)) && (
        <p role="alert" className="m-0 text-xs text-danger">
          {jsonError ?? parsed.diagnostics[0]?.message}
        </p>
      )}
      {!unreadable && (
        <div>
          <button type="button" onClick={onBack} className={LINK}>
            Back to the list
          </button>
        </div>
      )}
    </div>
  );
}
