import {
  fieldChoices,
  parseFrontmatter,
  parseJournalFilename,
  readJournalMetadata,
  resolveEntryDate,
  UNDATED,
  type JournalFieldDefinition,
  type JournalFieldValue,
  type JournalMetadataResult
} from "@thinkbrain/core";

import { setFrontmatterField } from "./frontmatterEdit";
import { MetadataWidget } from "./MetadataWidget";

/**
 * Derives the widget's inputs from the open document.
 *
 * Everything comes from what is already on screen: the filename gives the date
 * (D20), the frontmatter gives the values, and an edit goes back through the
 * editor rather than to disk, so the user's Save stays the only thing that
 * writes.
 */

export interface MetadataWidgetContainerProps {
  readonly relativePath: string;
  readonly contents: string;
  readonly definitions: readonly JournalFieldDefinition[];
  readonly applyEdit?: (contents: string) => void;
  /** Promotes a key the note already uses into a configured field (D85). */
  readonly onDefineField?: (definition: JournalFieldDefinition) => void;
  /** Adds a value to a configured select field's options (D84). */
  readonly onAddOption?: (fieldId: string, option: string) => void;
}

/**
 * Invents a field for a key the note uses and the settings do not know (D85).
 *
 * The shape is inferred from what is written, and inferred conservatively: a
 * string becomes free text rather than a select, because turning someone's
 * sentence into a tappable pill is a guess that reads as damage. Promoting the
 * field in settings is where a real vocabulary gets chosen.
 */
function inferField(key: string, raw: unknown): JournalFieldDefinition {
  if (typeof raw === "number") return { id: key, label: key, type: "number" };
  if (Array.isArray(raw)) return { id: key, label: key, type: "multi-select", options: [] };
  return { id: key, label: key, type: "text" };
}

/**
 * Puts back the select values the definitions no longer recognise (D83).
 *
 * `readJournalMetadata` files them under `invalid`, which is the right answer
 * for the model — they genuinely do not match the definition. It is the wrong
 * answer for the editor, where hiding a value the note plainly contains means
 * the first tap on a pill silently overwrites it.
 */
function healed(
  metadata: JournalMetadataResult,
  definitions: readonly JournalFieldDefinition[]
): Readonly<Record<string, JournalFieldValue>> {
  const values: Record<string, JournalFieldValue> = { ...metadata.values };

  for (const definition of definitions) {
    const raw = metadata.invalid[definition.id];
    if (raw === undefined) continue;
    const { selected } = fieldChoices(definition, raw);
    if (selected.length === 0) continue;
    values[definition.id] =
      definition.type === "multi-select" ? [...selected] : selected[0]!;
  }

  return values;
}

export function MetadataWidgetContainer({
  relativePath,
  contents,
  definitions,
  applyEdit,
  onDefineField,
  onAddOption
}: MetadataWidgetContainerProps) {
  const ref = parseJournalFilename(relativePath);
  // No unambiguous date means no dateline; the app never guesses one (D38).
  if (ref === UNDATED) return null;

  const parsed = parseFrontmatter(contents);
  const resolved = resolveEntryDate(ref, parsed.metadata);
  const metadata = readJournalMetadata(parsed.metadata, definitions);

  // Keys the settings have never heard of are still the user's data (D33), so
  // they get a field of their own rather than being preserved out of sight.
  const unconfigured = Object.entries(metadata.unconfigured).map(([key, raw]) =>
    inferField(key, raw)
  );
  const values = { ...healed(metadata, definitions) };
  for (const field of unconfigured) {
    const raw = metadata.unconfigured[field.id];
    if (typeof raw === "string" || typeof raw === "number") values[field.id] = raw;
    else if (Array.isArray(raw) && raw.every((entry) => typeof entry === "string")) {
      values[field.id] = raw as readonly string[];
    }
  }

  return (
    <MetadataWidget
      date={resolved.date}
      definitions={definitions}
      unconfigured={unconfigured}
      onDefineField={onDefineField}
      onAddOption={onAddOption}
      values={values}
      diagnostics={[...parsed.diagnostics, ...resolved.diagnostics]}
      onSet={(fieldId, value) => applyEdit?.(setFrontmatterField(contents, fieldId, value))}
      readOnly={applyEdit === undefined}
    />
  );
}
