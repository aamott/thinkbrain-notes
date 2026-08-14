import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { uniqueStrings } from "./lib/strings";
import type {
  IndexMetadataField,
  IndexMetadataValue,
  MarkdownTask,
  NoteDiagnostic,
  ParsedNote,
  SerializableNote,
  WikiLink
} from "./note-model";

const INLINE_TAG_PATTERN = /(^|[^A-Za-z0-9_/-])#([A-Za-z0-9][A-Za-z0-9_/-]*)/g;
const WIKI_LINK_PATTERN = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
const TASK_PATTERN = /^\s*-\s+\[([ xX])\](?:\s+(.*))?$/;

/**
 * Parses a Markdown note into frontmatter metadata and derived Markdown indexes.
 *
 * Args:
 *   markdown: Complete Markdown file contents.
 *
 * Returns:
 *   Parsed frontmatter, body, tags, aliases, wiki links, tasks, and diagnostics.
 */
export function parseNote(markdown: string): ParsedNote {
  const frontmatterResult = parseFrontmatter(markdown);
  const maskedMarkdown = maskMarkdown(markdown, frontmatterResult.frontmatter);
  const diagnostics = [...frontmatterResult.diagnostics];

  const inlineTags = extractInlineTags(maskedMarkdown);
  const tags = uniqueStrings([...frontmatterResult.metadata.tags, ...inlineTags]);

  return {
    ...frontmatterResult,
    diagnostics,
    inlineTags,
    tags,
    aliases: frontmatterResult.metadata.aliases,
    indexMetadata: collectIndexMetadata(frontmatterResult.metadata, diagnostics),
    wikiLinks: extractWikiLinks(maskedMarkdown),
    tasks: extractMarkdownTasks(maskedMarkdown, markdown)
  };
}

function collectIndexMetadata(
  metadata: Readonly<Record<string, unknown>>,
  diagnostics: NoteDiagnostic[]
): IndexMetadataField[] {
  const fields: IndexMetadataField[] = [];

  for (const [key, rawValue] of Object.entries(metadata).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  )) {
    const rawValues = Array.isArray(rawValue) ? rawValue : [rawValue];
    const values: IndexMetadataValue[] = [];
    const seen = new Set<string>();
    let unsupportedCount = 0;

    for (const value of rawValues) {
      if (!isIndexMetadataValue(value)) {
        unsupportedCount += 1;
        continue;
      }

      const identity = `${typeof value}:${String(value)}`;
      if (!seen.has(identity)) {
        seen.add(identity);
        values.push(value);
      }
    }

    if (unsupportedCount > 0) {
      diagnostics.push({
        code: Array.isArray(rawValue)
          ? "frontmatter_metadata_unsupported_list_item"
          : "frontmatter_metadata_unsupported_value",
        message: Array.isArray(rawValue)
          ? `Frontmatter field "${key}" contains ${unsupportedCount} metadata ${
              unsupportedCount === 1 ? "value" : "values"
            } that cannot be indexed.`
          : `Frontmatter field "${key}" has a value that cannot be indexed.`,
        severity: "warning"
      });
    }

    if (values.length > 0) {
      fields.push({ key, values });
    }
  }

  return fields;
}

function isIndexMetadataValue(value: unknown): value is IndexMetadataValue {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

/**
 * Serializes a complete Markdown note when a caller explicitly chooses to save.
 * Extracts inline tags from the body and removes them from frontmatter tags to
 * preserve the note's body-only nature for inline tags.
 *
 * Args:
 *   note: Metadata and Markdown body to serialize.
 *
 * Returns:
 *   Markdown contents with YAML frontmatter followed by the body.
 */
export function serializeNote(note: SerializableNote): string {
  const maskedBody = maskMarkdown(note.body, null);
  const inlineTags = new Set(extractInlineTags(maskedBody));
  const metadata = { ...note.metadata };

  if (Array.isArray(metadata.tags)) {
    metadata.tags = metadata.tags.filter((tag) => typeof tag === "string" && !inlineTags.has(tag));
  }

  const frontmatter = serializeFrontmatter(metadata);

  if (frontmatter.length === 0) {
    return note.body;
  }

  if (note.body.length === 0) {
    return frontmatter;
  }

  return `${frontmatter}\n${note.body}`;
}

export function extractInlineTags(markdownBody: string): string[] {
  return collectMatches(markdownBody, INLINE_TAG_PATTERN, (match) => match[2]);
}

export function extractWikiLinks(markdownBody: string): WikiLink[] {
  const links: WikiLink[] = [];

  for (const match of markdownBody.matchAll(WIKI_LINK_PATTERN)) {
    const target = match[1]?.trim();

    if (!target) {
      continue;
    }

    const displayText = match[2]?.trim();
    const position = match.index ?? 0;
    const startOffset = position;
    const endOffset = position + match[0].length;

    links.push(
      displayText
        ? {
            target,
            displayText,
            position,
            startOffset,
            endOffset
          }
        : {
            target,
            position,
            startOffset,
            endOffset
          }
    );
  }

  return links;
}

export function extractMarkdownTasks(markdownBody: string, originalBody?: string): MarkdownTask[] {
  const tasks: MarkdownTask[] = [];
  const lines = markdownBody.split(/(\r?\n)/);
  const origLines = originalBody ? originalBody.split(/(\r?\n)/) : lines;

  let currentOffset = 0;
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i] ?? "";
    const origLine = origLines[i] ?? "";
    const match = TASK_PATTERN.exec(line);

    if (match) {
      const origMatch = TASK_PATTERN.exec(origLine);
      const startOffset = currentOffset + match.index;
      const endOffset = startOffset + match[0].length;
      tasks.push({
        checked: match[1]?.toLowerCase() === "x",
        text: origMatch?.[2]?.trim() ?? match[2]?.trim() ?? "",
        line: (i / 2) + 1,
        startOffset,
        endOffset
      });
    }

    currentOffset += line.length;
    if (i + 1 < lines.length) {
      currentOffset += (lines[i + 1] ?? "").length;
    }
  }

  return tasks;
}

function collectMatches(
  markdownBody: string,
  pattern: RegExp,
  pickValue: (match: RegExpMatchArray) => string | undefined
): string[] {
  const values: string[] = [];

  for (const match of markdownBody.matchAll(pattern)) {
    const value = pickValue(match)?.trim();

    if (value) {
      values.push(value);
    }
  }

  return uniqueStrings(values);
}

function maskMarkdown(markdown: string, frontmatter: { raw: string; endOffset: number } | null): string {
  let masked = markdown;

  if (frontmatter) {
    // Blank the whole block including both `---` fences, rather than
    // substituting only `raw`. Masking must be length- and line-preserving:
    // every offset and line number reported by the extractors is computed
    // against this masked text but describes a position in the original, so
    // dropping the fences would shift them all by the fences' width.
    const block = markdown.slice(0, frontmatter.endOffset);
    masked = block.replace(/[^\r\n]/g, " ") + masked.slice(frontmatter.endOffset);
  }

  // Mask fenced code blocks (e.g., ```lang ... ``` or ~~~ ... ~~~)
  masked = masked.replace(/^( {0,3})(`{3,}|~{3,})[^\n]*(?:\n([^]*?))?(?:\n[ \t]*\2[ \t]*$|(?![^]))/gm, (match) => {
    return match.replace(/[^\r\n]/g, " ");
  });

  // Mask inline code snippets
  masked = masked.replace(/(`+)((?:[^`\n]|\n(?!\n))+?)\1/g, (match) => {
    return match.replace(/[^\r\n]/g, " ");
  });

  return masked;
}
