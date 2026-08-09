import { validateFieldDefinition, type JournalFieldDefinition } from "@thinkbrain/core";
import { useState } from "react";

/**
 * Recording something new without leaving the entry (D86).
 *
 * A field made here is an ordinary frontmatter key holding free text (D87). The
 * settings are not touched: it arrives marked as a key the settings do not know
 * (D85), with the same one-tap promotion once it earns a place. Asking for a
 * field's shape on the page you came to write on would be the settings form
 * wearing a disguise.
 */

export interface AddFieldRowProps {
  /** Configured fields this entry is not already showing. */
  readonly available: readonly JournalFieldDefinition[];
  /** Keys already on the entry; offering one twice offers to overwrite it. */
  readonly existingKeys: readonly string[];
  readonly onAdd: (field: JournalFieldDefinition) => void;
}

/** `How I slept` becomes `how-i-slept`; D49's rule decides what survives. */
function deriveKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[0-9]/.test(slug) ? `f-${slug}` : slug;
}

const MENU =
  "mt-1 w-60 overflow-hidden rounded-small border border-border bg-background shadow-lg";
const OPTION =
  "flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-xs cursor-pointer hover:bg-secondary";
const HEAD =
  "bg-muted px-2 py-1 text-[0.62rem] uppercase tracking-[0.09em] text-muted-foreground";

export function AddFieldRow({ available, existingKeys, onAdd }: AddFieldRowProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const close = (): void => {
    setOpen(false);
    setDraft("");
  };

  const typed = draft.trim();
  const key = deriveKey(typed);
  const matched = available.find(
    (field) => field.label.toLowerCase() === typed.toLowerCase() || field.id === key
  );
  const offered = typed === ""
    ? available
    : available.filter((field) => field.label.toLowerCase().includes(typed.toLowerCase()));

  // Validity is the model's to decide; this only turns the code into words.
  const check = typed === "" ? null : validateFieldDefinition({ id: key, label: "x", type: "text" });
  const problem =
    typed === "" || matched
      ? null
      : existingKeys.includes(key)
        ? `"${key}" is already on this entry.`
        : check?.definition
          ? null
          : check?.diagnostics[0]?.code === "journal_field_reserved"
            ? `"${key}" is already used by the app itself. Try another name.`
            : "Give this a name using letters or numbers.";

  const add = (field: JournalFieldDefinition): void => {
    onAdd(field);
    close();
  };

  const commit = (): void => {
    if (typed === "" || problem !== null) return;
    add(matched ?? { id: key, label: typed, type: "text" });
  };

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Add a field"
        onClick={() => setOpen(true)}
        className="self-start rounded-small border border-dashed border-border px-2 py-0.5 text-[0.7rem] text-muted-foreground cursor-pointer hover:text-foreground"
      >
        ＋ Add a field
      </button>
    );
  }

  return (
    <div className="relative flex flex-col">
      <input
        autoFocus
        aria-label="New field name"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        className="h-7 w-60 rounded-small border border-input bg-background px-2 text-xs text-foreground"
      />

      <div className={MENU}>
        {offered.length > 0 && (
          <>
            <p className={`m-0 ${HEAD}`}>Your fields</p>
            {offered.map((field) => (
              <button
                key={field.id}
                type="button"
                aria-label={`Add ${field.label}`}
                onClick={() => add(field)}
                className={OPTION}
              >
                {field.label}
              </button>
            ))}
          </>
        )}

        {typed !== "" && !matched && problem === null && (
          <>
            <p className={`m-0 ${HEAD}`}>New field, on this entry</p>
            <button type="button" aria-label={`Add ${typed}`} onClick={commit} className={OPTION}>
              {typed}
              <span className="ml-auto font-mono text-[0.66rem] text-muted-foreground">
                {key}:
              </span>
            </button>
          </>
        )}

        {problem !== null && (
          <p role="alert" className="m-0 px-2 py-1.5 text-[0.7rem] text-danger">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
