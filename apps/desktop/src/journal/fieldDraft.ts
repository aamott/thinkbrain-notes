import type { JournalFieldDefinition, JournalFieldType } from "@thinkbrain/core";

/**
 * The add/edit form's model: what a draft field is, and how it turns back into
 * the JSON the setting stores.
 *
 * Kept away from the control so both the field list and the edit card read the
 * same shape — and so the card component can stay a component file.
 */

export const isSelect = (type: JournalFieldType): boolean =>
  type === "single-select" || type === "multi-select";

export interface Kind {
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
export const KINDS: readonly Kind[] = [
  { type: "single-select", label: "Pick one from a list", example: "good" },
  { type: "multi-select", label: "Pick several from a list", example: "baking, reading" },
  { type: "number", label: "A number", example: "7" },
  { type: "text", label: "A few words", example: "Try 2% salt" }
];

export interface Draft {
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

export const blankDraft = (): Draft => ({
  label: "",
  key: "",
  keyEdited: false,
  type: "single-select",
  options: [],
  editing: null,
  originalKey: null
});

export const draftOf = (field: JournalFieldDefinition, index: number): Draft => ({
  label: field.label,
  key: field.id,
  keyEdited: false,
  type: field.type,
  options: field.options ?? [],
  editing: index,
  originalKey: field.id
});

export const toDefinition = (draft: Draft): Record<string, unknown> => ({
  id: draft.key,
  label: draft.label.trim(),
  type: draft.type,
  ...(isSelect(draft.type) ? { options: draft.options } : {})
});
