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
// The class excludes both brackets, so a failed attempt dies at the next
// `[`/`]` instead of rescanning it at every offset; the target/alias `|`
// split happens in code.
const WIKI_LINK_PATTERN = /\[\[([^[\]]+)\]\]/g;
// \s+ and \S.* are disjoint, so there's no ambiguity for the analyzer or engine.
const TASK_PATTERN = /^\s*-\s+\[([ xX])\](?:\s+(\S.*)?)?$/;

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
    tags,
    aliases: frontmatterResult.metadata.aliases,
    indexMetadata: collectIndexMetadata(frontmatterResult.metadata, diagnostics),
    wikiLinks: extractWikiLinks(maskedMarkdown),
    tasks: extractMarkdownTasks(maskedMarkdown, markdown)
  };
}

/** Three-way compare for deterministic key order — internal ids, not user-facing text, so no localeCompare. */
const compareMetadataKeys = ([left]: [string, unknown], [right]: [string, unknown]): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

/** Filters raw metadata values to indexable ones, deduped by type+string identity. */
function collectSupportedValues(rawValues: readonly unknown[]): {
  values: IndexMetadataValue[];
  unsupportedCount: number;
} {
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

  return { values, unsupportedCount };
}

function unsupportedMetadataDiagnostic(
  key: string,
  rawValue: unknown,
  unsupportedCount: number
): NoteDiagnostic {
  const isList = Array.isArray(rawValue);
  const noun = unsupportedCount === 1 ? "value" : "values";
  return {
    code: isList
      ? "frontmatter_metadata_unsupported_list_item"
      : "frontmatter_metadata_unsupported_value",
    message: isList
      ? `Frontmatter field "${key}" contains ${unsupportedCount} metadata ${noun} that cannot be indexed.`
      : `Frontmatter field "${key}" has a value that cannot be indexed.`,
    severity: "warning"
  };
}

function collectIndexMetadata(
  metadata: Readonly<Record<string, unknown>>,
  diagnostics: NoteDiagnostic[]
): IndexMetadataField[] {
  const fields: IndexMetadataField[] = [];

  for (const [key, rawValue] of Object.entries(metadata).sort(compareMetadataKeys)) {
    const rawValues = Array.isArray(rawValue) ? rawValue : [rawValue];
    const { values, unsupportedCount } = collectSupportedValues(rawValues);

    if (unsupportedCount > 0) {
      diagnostics.push(unsupportedMetadataDiagnostic(key, rawValue, unsupportedCount));
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

function extractInlineTags(markdownBody: string): string[] {
  return collectMatches(markdownBody, INLINE_TAG_PATTERN, (match) => match[2]);
}

function extractWikiLinks(markdownBody: string): WikiLink[] {
  const links: WikiLink[] = [];

  for (const match of markdownBody.matchAll(WIKI_LINK_PATTERN)) {
    const target = match[1]?.split("|")[0]?.trim();

    if (!target) {
      continue;
    }

    links.push({ target, startOffset: match.index });
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

/** Replaces every non-newline character with a space (length- and line-preserving mask). */
const blankNonNewlines = (text: string): string => text.replace(/[^\r\n]/g, " ");

function maskMarkdown(markdown: string, frontmatter: { endOffset: number } | null): string {
  let masked = markdown;

  if (frontmatter) {
    // Blank the whole block including both `---` fences, rather than
    // substituting only `raw`. Masking must be length- and line-preserving:
    // every offset and line number reported by the extractors is computed
    // against this masked text but describes a position in the original, so
    // dropping the fences would shift them all by the fences' width.
    const block = markdown.slice(0, frontmatter.endOffset);
    masked = blankNonNewlines(block) + masked.slice(frontmatter.endOffset);
  }

  masked = maskFencedCode(masked);
  masked = maskInlineCode(masked);

  return masked;
}

const FENCE_OPEN_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE_PATTERN = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

/** A fence closes on a line holding only the same run between whitespace. */
const isFenceClose = (line: string, run: string): boolean =>
  FENCE_CLOSE_PATTERN.exec(line)?.[1] === run;

/**
 * Masks fenced code blocks (```lang ... ``` or ~~~ ... ~~~). A line scan
 * replaces the old multi-line regexes: an open fence runs through the line
 * holding only the same run, or to the end of input when it never closes.
 */
function maskFencedCode(text: string): string {
  const lines = text.split("\n");

  let index = 0;
  while (index < lines.length) {
    const run = FENCE_OPEN_PATTERN.exec(lines[index] ?? "")?.[1];
    if (!run) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < lines.length && !isFenceClose(lines[end] ?? "", run)) {
      end += 1;
    }

    const last = Math.min(end, lines.length - 1);
    for (let i = index; i <= last; i += 1) {
      lines[i] = blankNonNewlines(lines[i] ?? "");
    }
    index = last + 1;
  }

  return lines.join("\n");
}

/**
 * Masks inline code spans (`code`). An open run of backticks closes on the
 * first later run at least as long, and the content between may not contain
 * backticks or a blank line. Scanning keeps this linear, where the old `\1`
 * backreference regex backtracked once per offset inside backtick runs.
 */
function maskInlineCode(text: string): string {
  const runLength = (index: number): number => {
    let length = 0;
    while (text[index + length] === "`") {
      length += 1;
    }
    return length;
  };

  const spans: Array<readonly [number, number]> = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "`") {
      index += 1;
      continue;
    }

    const openLength = runLength(index);
    // The first backtick after the opener is the only possible close.
    let close = index + openLength;
    let hitBlankLine = false;
    while (close < text.length && text[close] !== "`") {
      if (text[close] === "\n" && text[close + 1] === "\n") {
        hitBlankLine = true;
        break;
      }
      close += 1;
    }

    if (!hitBlankLine && close > index + openLength && runLength(close) >= openLength) {
      spans.push([index, close + openLength]);
      index = close + openLength;
    } else {
      index += 1;
    }
  }

  let masked = "";
  let cursor = 0;
  for (const [start, end] of spans) {
    masked += text.slice(cursor, start) + blankNonNewlines(text.slice(start, end));
    cursor = end;
  }
  return masked + text.slice(cursor);
}
