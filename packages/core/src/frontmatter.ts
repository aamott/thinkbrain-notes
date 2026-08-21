import { parseDocument, stringify } from "yaml";

import { isRecord } from "./settings/internal";
import { uniqueStrings } from "./lib/strings";
import type {
  FrontmatterParseResult,
  NoteDiagnostic,
  NoteMetadata,
  ParsedFrontmatterBlock
} from "./note-model";

const FRONTMATTER_OPEN_PATTERN = /^(?:\uFEFF)?---[ \t]*(?:\r?\n|$)/;
const FRONTMATTER_CLOSE_PATTERN = /^---[ \t]*(?:\r?\n|$)/gm;
const RESERVED_METADATA_FIELDS = new Set([
  "title",
  "tags",
  "aliases",
  "status",
  "created_at",
  "updated_at"
]);

interface YamlLinePosition {
  readonly line: number;
  readonly col: number;
}

interface YamlIssue {
  readonly message: string;
  readonly linePos?: readonly YamlLinePosition[];
}

/**
 * Parses optional YAML frontmatter without mutating or rewriting note content.
 *
 * Args:
 *   markdown: Complete Markdown file contents.
 *
 * Returns:
 *   Metadata, raw Markdown body, raw frontmatter offsets, and diagnostics. Invalid
 *   YAML is reported through diagnostics and falls back to treating the whole
 *   input as body so callers never accidentally rewrite a damaged note.
 */
export function parseFrontmatter(markdown: string): FrontmatterParseResult {
  const emptyResult = createFrontmatterResult(EMPTY_METADATA, markdown, null, []);
  const openingMatch = FRONTMATTER_OPEN_PATTERN.exec(markdown);

  if (!openingMatch) {
    return emptyResult;
  }

  const frontmatterStart = openingMatch[0].length;
  FRONTMATTER_CLOSE_PATTERN.lastIndex = frontmatterStart;

  const closingMatch = FRONTMATTER_CLOSE_PATTERN.exec(markdown);

  if (!closingMatch) {
    return createFrontmatterResult(EMPTY_METADATA, markdown, null, [
      {
        code: "frontmatter_missing_closing_fence",
        message: "YAML frontmatter starts with --- but has no closing --- fence.",
        severity: "error"
      }
    ]);
  }

  const rawFrontmatter = markdown.slice(frontmatterStart, closingMatch.index);
  const frontmatterBlock: ParsedFrontmatterBlock = {
    raw: rawFrontmatter,
    startOffset: 0,
    endOffset: closingMatch.index + closingMatch[0].length
  };
  const document = parseDocument(rawFrontmatter, { prettyErrors: false });
  const diagnostics: NoteDiagnostic[] = [
    ...yamlIssuesToDiagnostics(document.errors, "frontmatter_yaml_error", "error"),
    ...yamlIssuesToDiagnostics(document.warnings, "frontmatter_yaml_warning", "warning")
  ];

  if (document.errors.length > 0) {
    return createFrontmatterResult(EMPTY_METADATA, markdown, frontmatterBlock, diagnostics);
  }

  const parsedYaml = document.toJSON() as unknown;
  const rawFields = coerceFrontmatterFields(parsedYaml, diagnostics);
  const metadata = normalizeNoteMetadata(rawFields, diagnostics);
  const body = markdown.slice(frontmatterBlock.endOffset);

  return createFrontmatterResult(metadata, body, frontmatterBlock, diagnostics);
}

/**
 * Serializes frontmatter fields with all unknown keys preserved by default.
 *
 * Args:
 *   metadata: Known and unknown frontmatter fields to write.
 *
 * Returns:
 *   A fenced YAML frontmatter block.
 */
export function serializeFrontmatter(metadata: Readonly<Record<string, unknown>>): string {
  const cleanMetadata = { ...metadata };

  if (Array.isArray(cleanMetadata.tags) && cleanMetadata.tags.length === 0) {
    delete cleanMetadata.tags;
  }

  if (Array.isArray(cleanMetadata.aliases) && cleanMetadata.aliases.length === 0) {
    delete cleanMetadata.aliases;
  }

  if (Object.keys(cleanMetadata).length === 0) {
    return "";
  }

  const yamlText = stringify(cleanMetadata, { lineWidth: 0 }).trimEnd();

  if (yamlText.length === 0) {
    return "";
  }

  return `---\n${yamlText}\n---`;
}



export function normalizeNoteMetadata(
  fields: Readonly<Record<string, unknown>>,
  diagnostics: NoteDiagnostic[] = []
): NoteMetadata {
  const metadata: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (!RESERVED_METADATA_FIELDS.has(key)) {
      metadata[key] = value;
    }
  }

  const optionalStringFields = ["title", "status", "created_at", "updated_at"] as const;
  for (const field of optionalStringFields) {
    const value = normalizeOptionalString(fields[field], field, diagnostics);
    if (value !== undefined) {
      metadata[field] = value;
    }
  }

  metadata.tags = normalizeStringList(
    fields.tags,
    "tags",
    diagnostics,
    (v) => normalizeStringItem(v, /^#+/)
  );
  metadata.aliases = normalizeStringList(fields.aliases, "aliases", diagnostics, normalizeStringItem);

  return metadata as NoteMetadata;
}

function createFrontmatterResult(
  metadata: NoteMetadata,
  body: string,
  frontmatter: ParsedFrontmatterBlock | null,
  diagnostics: readonly NoteDiagnostic[]
): FrontmatterParseResult {
  return {
    metadata,
    body,
    frontmatter,
    diagnostics
  };
}

/**
 * Shared empty metadata singleton. Callers never mutate the returned metadata
 * (consumers spread before writing — see `serializeNote`), so a single frozen
 * instance replaces the per-call factory without risk of cross-contamination.
 */
const EMPTY_METADATA: NoteMetadata = Object.freeze({
  tags: Object.freeze<string[]>([]),
  aliases: Object.freeze<string[]>([])
}) as NoteMetadata;

function coerceFrontmatterFields(
  parsedYaml: unknown,
  diagnostics: NoteDiagnostic[]
): Readonly<Record<string, unknown>> {
  if (parsedYaml == null) {
    return {};
  }

  if (isRecord(parsedYaml)) {
    return parsedYaml;
  }

  diagnostics.push({
    code: "frontmatter_not_mapping",
    message: "YAML frontmatter must be an object mapping of keys to values.",
    severity: "error"
  });

  return {};
}

function yamlIssuesToDiagnostics(
  issues: readonly YamlIssue[],
  code: string,
  severity: NoteDiagnostic["severity"]
): NoteDiagnostic[] {
  return issues.map((issue) => {
    const position = issue.linePos?.[0];

    return {
      code,
      message: issue.message,
      severity,
      line: position?.line,
      column: position?.col
    };
  });
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
  diagnostics: NoteDiagnostic[]
): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "string") {
    diagnostics.push({
      code: "frontmatter_invalid_field_type",
      message: `Frontmatter field "${fieldName}" must be a string when present.`,
      severity: "warning"
    });

    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringList(
  value: unknown,
  fieldName: string,
  diagnostics: NoteDiagnostic[],
  normalizeItem: (value: string) => string | null
): string[] {
  if (value == null) {
    return [];
  }

  if (typeof value === "string") {
    const normalized = normalizeItem(value);
    return normalized === null ? [] : [normalized];
  }

  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "frontmatter_invalid_field_type",
      message: `Frontmatter field "${fieldName}" must be a string or string array when present.`,
      severity: "warning"
    });

    return [];
  }

  const normalizedValues: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      diagnostics.push({
        code: "frontmatter_invalid_list_item",
        message: `Frontmatter field "${fieldName}" contains a non-string item.`,
        severity: "warning"
      });
      continue;
    }

    const normalized = normalizeItem(item);

    if (normalized !== null) {
      normalizedValues.push(normalized);
    }
  }

  return uniqueStrings(normalizedValues);
}

/** Trims a string list item; optionally strips a leading pattern (e.g. `#` from tags). */
function normalizeStringItem(value: string, strip?: RegExp): string | null {
  const trimmed = strip ? value.trim().replace(strip, "") : value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
