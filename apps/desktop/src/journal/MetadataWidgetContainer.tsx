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
  applyEdit
}: MetadataWidgetContainerProps) {
  const ref = parseJournalFilename(relativePath);
  // No unambiguous date means no dateline; the app never guesses one (D38).
  if (ref === UNDATED) return null;

  const parsed = parseFrontmatter(contents);
  const resolved = resolveEntryDate(ref, parsed.metadata);
  const metadata = readJournalMetadata(parsed.metadata, definitions);

  return (
    <MetadataWidget
      date={resolved.date}
      definitions={definitions}
      values={healed(metadata, definitions)}
      diagnostics={[...parsed.diagnostics, ...resolved.diagnostics]}
      onSet={(fieldId, value) => applyEdit?.(setFrontmatterField(contents, fieldId, value))}
    />
  );
}
