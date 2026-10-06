import { deriveFieldKey } from "./fieldKey";
import { isSelect, KINDS, type Draft } from "./fieldDraft";

/**
 * The add/edit card for one field definition (D82).
 *
 * A controlled form: every edit goes back up through `onDraftChange`, and the
 * parent owns whether the draft can be committed (`problem` is already worked
 * out) and what saving does (`onCommit` writes the setting).
 */

export const LINK =
  "bg-transparent border-0 text-xs text-muted-foreground underline underline-offset-2 cursor-pointer hover:text-foreground";
export const BTN =
  "inline-flex items-center gap-1 rounded-small border border-border bg-background px-2 py-1 text-xs text-foreground cursor-pointer disabled:opacity-50";
export const PRIMARY =
  "inline-flex items-center gap-1 rounded-small bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground cursor-pointer disabled:opacity-50";
const INPUT =
  "rounded-small border border-input bg-background px-2 py-1 text-xs text-foreground";

export interface FieldDraftCardProps {
  readonly draft: Draft;
  /** The half-typed new choice in the options editor. */
  readonly choice: string;
  /** Why the draft cannot be saved yet, or `null` when it can. */
  readonly problem: string | null;
  readonly onDraftChange: (next: Draft | null) => void;
  readonly onChoiceChange: (next: string) => void;
  readonly onAddChoice: () => void;
  readonly onCancel: () => void;
  readonly onCommit: () => void;
}

export function FieldDraftCard({
  draft,
  choice,
  problem,
  onDraftChange,
  onChoiceChange,
  onAddChoice,
  onCancel,
  onCommit
}: FieldDraftCardProps) {
  return (
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
            onDraftChange({ ...draft, label, key: follows ? deriveFieldKey(label) : draft.key });
          }}
          className={INPUT}
        />
        {draft.keyEdited ? (
          <>
            <input
              aria-label="Key in your notes"
              value={draft.key}
              onChange={(event) => onDraftChange({ ...draft, key: event.target.value })}
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
              onClick={() => onDraftChange({ ...draft, keyEdited: true })}
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
                onClick={() => onDraftChange({ ...draft, type: kind.type })}
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
                    onDraftChange({
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
              onChange={(event) => onChoiceChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onAddChoice();
              }}
              className={`${INPUT} w-28`}
            />
            <button type="button" aria-label="Add choice" onClick={onAddChoice} className={BTN}>
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
        <button type="button" onClick={onCancel} className={BTN}>
          Cancel
        </button>
        <button
          type="button"
          aria-label={draft.editing === null ? "Add field" : "Save field"}
          disabled={problem !== null || draft.label.trim() === ""}
          onClick={onCommit}
          className={PRIMARY}
        >
          {draft.editing === null ? "Add field" : "Save field"}
        </button>
      </div>
    </div>
  );
}
