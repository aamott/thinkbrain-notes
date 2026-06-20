import { parseDocument, stringify } from "yaml";

import type {
  FrontmatterParseResult,
  NoteDiagnostic,
  NoteMetadata,
  ParsedFrontmatterBlock,
  SerializableNote
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
  const emptyResult = createFrontmatterResult(createEmptyMetadata(), markdown, null, []);
  const openingMatch = FRONTMATTER_OPEN_PATTERN.exec(markdown);

  if (!openingMatch) {
    return emptyResult;
  }

  const frontmatterStart = openingMatch[0].length;
  FRONTMATTER_CLOSE_PATTERN.lastIndex = frontmatterStart;

  const closingMatch = FRONTMATTER_CLOSE_PATTERN.exec(markdown);

  if (!closingMatch) {
    return createFrontmatterResult(createEmptyMetadata(), markdown, null, [
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
    return createFrontmatterResult(createEmptyMetadata(), markdown, frontmatterBlock, diagnostics);
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
  const yamlText = stringify(metadata, { lineWidth: 0 }).trimEnd();

  if (yamlText.length === 0) {
    return "---\n---";
  }

  return `---\n${yamlText}\n---`;
}

/**
 * Serializes a complete Markdown note when a caller explicitly chooses to save.
 *
 * Args:
 *   note: Metadata and Markdown body to serialize.
 *
 * Returns:
 *   Markdown contents with YAML frontmatter followed by the body.
 */
export function serializeNote(note: SerializableNote): string {
  const frontmatter = serializeFrontmatter(note.metadata);

  if (note.body.length === 0) {
    return frontmatter;
  }

  return `${frontmatter}\n${note.body}`;
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

  const title = normalizeOptionalString(fields.title, "title", diagnostics);
  const status = normalizeOptionalString(fields.status, "status", diagnostics);
  const createdAt = normalizeOptionalString(fields.created_at, "created_at", diagnostics);
  const updatedAt = normalizeOptionalString(fields.updated_at, "updated_at", diagnostics);

  if (title !== undefined) {
    metadata.title = title;
  }

  if (status !== undefined) {
    metadata.status = status;
  }

  if (createdAt !== undefined) {
    metadata.created_at = createdAt;
  }

  if (updatedAt !== undefined) {
    metadata.updated_at = updatedAt;
  }

  metadata.tags = normalizeStringList(fields.tags, "tags", diagnostics, normalizeTagName);
  metadata.aliases = normalizeStringList(fields.aliases, "aliases", diagnostics, normalizeAlias);

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

function createEmptyMetadata(): NoteMetadata {
  return {
    tags: [],
    aliases: []
  };
}

function coerceFrontmatterFields(
  parsedYaml: unknown,
  diagnostics: NoteDiagnostic[]
): Readonly<Record<string, unknown>> {
  if (parsedYaml === null || parsedYaml === undefined) {
    return {};
  }

  if (isPlainRecord(parsedYaml)) {
    return parsedYaml;
  }

  diagnostics.push({
    code: "frontmatter_not_mapping",
    message: "YAML frontmatter must be an object mapping of keys to values.",
    severity: "error"
  });

  return {};
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (value === undefined || value === null) {
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
  if (value === undefined || value === null) {
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

function normalizeTagName(value: string): string | null {
  const trimmed = value.trim().replace(/^#+/, "");
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAlias(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
