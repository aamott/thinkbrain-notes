import {
  validateFieldDefinition,
  type JournalFieldDefinition,
  type JournalFieldType
} from "@thinkbrain/core";
import { useState } from "react";

import { registerControl, type ControlProps } from "../settings/controlRegistry";
import { FIELD_DEFINITIONS_CONTROL, parseFieldDefinitions } from "./journalSettings";

/**
 * Editor for the journal's user-defined metadata fields (D49 storage, D82 form).
 *
 * The definitions are still one JSON array in one string setting — D49 fixed how
 * they are stored, not how they are edited, and this control is the seam that
 * lets the editing surface be a form. `Edit as JSON` keeps the old textarea for
 * anyone who wants it, and is the automatic fallback when the stored value is
 * something this form cannot draw.
 *
 * Validity is not re-implemented here: a candidate is run through
 * `validateFieldDefinition`, and this file only turns its diagnostic codes into
 * words somebody would want to read.
 */

interface Kind {
  readonly type: JournalFieldType;
  readonly label: string;
  readonly example: string;
}

/**
 * D82: the words a first-time user reads.
 *
 * The examples are illustrations of a shape, not fields we ship — the
 * vocabulary stays the user's (D4).
 */
const KINDS: readonly Kind[] = [
  { type: "single-select", label: "Pick one from a list", example: "good" },
  { type: "multi-select", label: "Pick several from a list", example: "baking, reading" },
  { type: "number", label: "A number", example: "7" },
  { type: "text", label: "A few words", example: "Try 2% salt" }
];

const isSelect = (type: JournalFieldType): boolean =>
  type === "single-select" || type === "multi-select";

/** `How I felt` becomes `how-i-felt`; D49's rule decides what survives. */
function deriveFieldKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // The rule requires a leading letter, so a name starting with a digit gets
  // one rather than being silently rejected.
  return /^[0-9]/.test(slug) ? `f-${slug}` : slug;
}

/** Turns a validation code into something worth reading (D82). */
function explain(code: string, key: string): string {
  switch (code) {
    case "journal_field_reserved":
      return `"${key}" is already used by the app itself. Give this one a different name, or set its key by hand.`;
    case "journal_field_id_invalid":
      return "Give this a name using letters or numbers.";
    case "journal_field_options_missing":
      return "Add at least one choice, or make this a few words instead.";
    default:
      return "This field can't be saved yet.";
  }
}

interface Draft {
  readonly label: string;
  readonly key: string;
  /** Once the key is set by hand it stops following the name. */
  readonly keyEdited: boolean;
  readonly type: JournalFieldType;
  readonly options: readonly string[];
  /** The index being edited, or null when the draft is a new field. */
  readonly editing: number | null;
  /** The key this field had before the edit, for the re-key warning. */
  readonly originalKey: string | null;
}

const blankDraft = (): Draft => ({
  label: "",
  key: "",
  keyEdited: false,
  type: "single-select",
  options: [],
  editing: null,
  originalKey: null
});

const draftOf = (field: JournalFieldDefinition, index: number): Draft => ({
  label: field.label,
  key: field.id,
  keyEdited: false,
  type: field.type,
  options: field.options ?? [],
  editing: index,
  originalKey: field.id
});

const toDefinition = (draft: Draft): Record<string, unknown> => ({
  id: draft.key,
  label: draft.label.trim(),
  type: draft.type,
  ...(isSelect(draft.type) ? { options: draft.options } : {})
});

const summarise = (field: JournalFieldDefinition): string => {
  const kind = KINDS.find((candidate) => candidate.type === field.type);
  const words = kind?.label.replace(" from a list", "") ?? field.type;
  return field.options?.length ? `${words} — ${field.options.join(" · ")}` : words;
};

const ROW = "flex items-center gap-2 px-2 py-1.5 border-b border-border last:border-b-0 min-h-11";
const LINK =
  "bg-transparent border-0 text-xs text-muted-foreground underline underline-offset-2 cursor-pointer hover:text-foreground";
const BTN =
  "inline-flex items-center gap-1 rounded-small border border-border bg-background px-2 py-1 text-xs text-foreground cursor-pointer disabled:opacity-50";
const PRIMARY =
  "inline-flex items-center gap-1 rounded-small bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground cursor-pointer disabled:opacity-50";
const INPUT =
  "rounded-small border border-input bg-background px-2 py-1 text-xs text-foreground";

export function JournalFieldDefinitionsControl({
  definition,
  value,
  onChange,
  disabled
}: ControlProps) {
  const stored = typeof value === "string" ? value : "[]";
  const parsed = parseFieldDefinitions(stored);
  const unreadable = parsed.diagnostics.length > 0;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [choice, setChoice] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);
  // A value this form cannot draw opens in JSON, so nobody is locked out of
  // their own setting by a control that will not render it.
  const [json, setJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(stored);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const fields = parsed.definitions;
  const write = (next: readonly (JournalFieldDefinition | Record<string, unknown>)[]): void => {
    onChange(JSON.stringify(next, null, 2));
  };

  // ---- the add / edit card -------------------------------------------------

  const candidate = draft === null ? null : toDefinition(draft);
  const check = candidate === null ? null : validateFieldDefinition(candidate);
  const duplicate =
    draft !== null &&
    draft.key !== "" &&
    fields.some((field, index) => field.id === draft.key && index !== draft.editing);
  // A select with no choices parses — an empty list is still a list — but it is
  // a field nobody can fill in, so the form asks for one before it will save.
  const choiceless =
    draft !== null && isSelect(draft.type) && draft.options.length === 0;

  // The key is checked on its own and first: while somebody is still typing a
  // name, "that word is taken" is the useful thing to say, not "add a choice".
  const keyCheck =
    draft === null
      ? null
      : validateFieldDefinition({ id: draft.key, label: "x", type: "text" });

  const problem =
    draft === null || draft.label.trim() === ""
      ? null
      : !keyCheck?.definition
        ? explain(keyCheck?.diagnostics[0]?.code ?? "", draft.key)
        : duplicate
          ? `You already have a field saved as "${draft.key}".`
          : choiceless
            ? explain("journal_field_options_missing", draft.key)
            : check?.definition
              ? null
              : explain(check?.diagnostics[0]?.code ?? "", draft.key);

  const commit = (): void => {
    if (draft === null || candidate === null || problem !== null) return;
    const next = fields.map((field) => ({ ...field })) as Record<string, unknown>[];
    if (draft.editing === null) next.push(candidate);
    else next[draft.editing] = candidate;
    write(next);
    setDraft(null);
    setChoice("");
  };

  const card = (draft: Draft): React.ReactNode => (
    <div className="flex flex-col gap-3 rounded-small border border-border bg-muted p-2.5">
      <span className="text-xs font-semibold">
        {draft.editing === null ? "New field" : `Editing ${draft.label || "field"}`}
      </span>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">What do you want to call it?</span>
        <input
          aria-label="Field name"
          value={draft.label}
          onChange={(event) => {
            const label = event.target.value;
            // The key follows the name only while the field is new. Renaming an
            // existing field must not move its key: notes are linked by the key,
            // and D82 makes renaming the safe half of editing on purpose.
            const follows = !draft.keyEdited && draft.originalKey === null;
            setDraft({ ...draft, label, key: follows ? deriveFieldKey(label) : draft.key });
          }}
          className={INPUT}
        />
        {draft.keyEdited ? (
          <>
            <input
              aria-label="Key in your notes"
              value={draft.key}
              onChange={(event) => setDraft({ ...draft, key: event.target.value })}
              className={`${INPUT} font-mono`}
            />
            <span className="text-[0.68rem] text-muted-foreground">
              Lowercase letters, numbers, - and _.
            </span>
            {draft.originalKey !== null && draft.key !== draft.originalKey && (
              <span className="text-[0.68rem] text-warning">
                Notes already using "{draft.originalKey}" will stop being linked to this field.
              </span>
            )}
          </>
        ) : (
          <span className="text-[0.68rem] text-muted-foreground">
            Saved in your notes as <code className="font-mono">{draft.key || "…"}</code>{" "}
            <button
              type="button"
              onClick={() => setDraft({ ...draft, keyEdited: true })}
              className={LINK}
            >
              Change
            </button>
          </span>
        )}
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">What kind of thing is it?</span>
        <div role="radiogroup" aria-label="Field kind" className="flex flex-col gap-1">
          {KINDS.map((kind) => {
            const on = draft.type === kind.type;
            return (
              <button
                key={kind.type}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={kind.label}
                onClick={() => setDraft({ ...draft, type: kind.type })}
                className={`flex min-h-11 items-center gap-2 rounded-small border px-2 py-1 text-xs cursor-pointer ${
                  on
                    ? "border-accent-foreground bg-accent font-semibold text-accent-foreground"
                    : "border-border text-foreground"
                }`}
              >
                {kind.label}
                <span className="ml-auto text-[0.68rem] font-normal text-muted-foreground">
                  {kind.example}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isSelect(draft.type) && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium">What are the choices?</span>
          <div className="flex flex-wrap items-center gap-1">
            {draft.options.map((option) => (
              <span
                key={option}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs"
              >
                {option}
                <button
                  type="button"
                  aria-label={`Remove choice ${option}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      options: draft.options.filter((entry) => entry !== option)
                    })
                  }
                  className="border-0 bg-transparent text-[0.68rem] text-muted-foreground cursor-pointer"
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              aria-label="New choice"
              value={choice}
              placeholder="add a choice"
              onChange={(event) => setChoice(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addChoice();
              }}
              className={`${INPUT} w-28`}
            />
            <button type="button" aria-label="Add choice" onClick={addChoice} className={BTN}>
              ＋
            </button>
          </div>
        </div>
      )}

      {problem !== null && (
        <p role="alert" className="m-0 text-xs text-danger">
          {problem}
        </p>
      )}

      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            setChoice("");
          }}
          className={BTN}
        >
          Cancel
        </button>
        <button
          type="button"
          aria-label={draft.editing === null ? "Add field" : "Save field"}
          disabled={problem !== null || draft.label.trim() === ""}
          onClick={commit}
          className={PRIMARY}
        >
          {draft.editing === null ? "Add field" : "Save field"}
        </button>
      </div>
    </div>
  );

  function move(index: number, delta: number): void {
    const next = [...fields];
    const target = index + delta;
    const moved = next[index];
    const displaced = next[target];
    if (!moved || !displaced) return;
    next[target] = moved;
    next[index] = displaced;
    write(next);
  }

  function addChoice(): void {
    if (draft === null) return;
    const text = choice.trim();
    setChoice("");
    if (text === "" || draft.options.includes(text)) return;
    setDraft({ ...draft, options: [...draft.options, text] });
  }

  // ---- the JSON escape hatch ----------------------------------------------

  if (json || unreadable) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          className="min-h-[7rem] w-full rounded border border-border bg-input p-2 font-mono text-xs text-foreground"
          aria-label={`${definition.label}, JSON`}
          spellCheck={false}
          disabled={disabled}
          value={json ? jsonDraft : stored}
          onChange={(event) => {
            const next = event.target.value;
            setJsonDraft(next);
            setJson(true);
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
            <button type="button" onClick={() => setJson(false)} className={LINK}>
              Back to the list
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- the list ------------------------------------------------------------

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-small border border-border">
        {fields.length === 0 && draft?.editing === undefined && fields.length === 0 && (
          <p className="m-0 px-2 py-2 text-xs text-muted-foreground">
            Nothing yet — entries are just the date and what you write, which is a fine way to
            journal.
          </p>
        )}

        {fields.map((field, index) =>
          removing === index ? (
            <div key={field.id} className="border-b border-border p-2 last:border-b-0">
              <div className="flex flex-col gap-2 rounded-small border border-border border-l-[3px] border-l-warning bg-muted p-2">
                <span className="text-xs">
                  Remove <strong>{field.label}</strong>? It won't be offered on new entries.
                  Anything you've already recorded stays in your notes exactly as it is.
                </span>
                <div className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => setRemoving(null)} className={BTN}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    aria-label="Remove field"
                    onClick={() => {
                      write(fields.filter((_unused, at) => at !== index));
                      setRemoving(null);
                    }}
                    className={PRIMARY}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div key={field.id} className={ROW}>
              <span className="min-w-[5rem] text-xs font-semibold">{field.label}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {summarise(field)}
              </span>
              {/* The list order is the order the fields appear on an entry. */}
              {index > 0 && (
                <button
                  type="button"
                  aria-label={`Move ${field.label} up`}
                  onClick={() => move(index, -1)}
                  className={LINK}
                >
                  ↑
                </button>
              )}
              {index < fields.length - 1 && (
                <button
                  type="button"
                  aria-label={`Move ${field.label} down`}
                  onClick={() => move(index, 1)}
                  className={LINK}
                >
                  ↓
                </button>
              )}
              <button
                type="button"
                aria-label={`Edit ${field.label}`}
                onClick={() => {
                  setDraft(draftOf(field, index));
                  setRemoving(null);
                }}
                className={LINK}
              >
                Edit
              </button>
              <button
                type="button"
                aria-label={`Remove ${field.label}`}
                onClick={() => {
                  setRemoving(index);
                  setDraft(null);
                }}
                className={`${LINK} text-danger`}
              >
                Remove
              </button>
            </div>
          )
        )}
      </div>

      {draft !== null && card(draft)}

      {draft === null && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Add a field"
            disabled={disabled}
            onClick={() => setDraft(blankDraft())}
            className={PRIMARY}
          >
            ＋ Add a field
          </button>
          <button
            type="button"
            onClick={() => {
              setJsonDraft(stored);
              setJson(true);
            }}
            className={LINK}
          >
            Edit as JSON
          </button>
        </div>
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
