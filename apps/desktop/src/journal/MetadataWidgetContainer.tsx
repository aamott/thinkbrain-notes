import {
  parseFrontmatter,
  parseJournalFilename,
  readJournalMetadata,
  resolveEntryDate,
  UNDATED,
  type JournalFieldDefinition
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
      values={metadata.values}
      diagnostics={[...parsed.diagnostics, ...resolved.diagnostics]}
      onSet={(fieldId, value) => applyEdit?.(setFrontmatterField(contents, fieldId, value))}
    />
  );
}
