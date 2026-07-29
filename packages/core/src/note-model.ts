export type NoteDiagnosticSeverity = "error" | "warning";

export interface NoteDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: NoteDiagnosticSeverity;
  readonly line?: number;
  readonly column?: number;
}

export interface NoteMetadata extends Readonly<Record<string, unknown>> {
  readonly title?: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly status?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
}

export interface ParsedFrontmatterBlock {
  readonly raw: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface FrontmatterParseResult {
  readonly metadata: NoteMetadata;
  readonly body: string;
  readonly frontmatter: ParsedFrontmatterBlock | null;
  readonly diagnostics: readonly NoteDiagnostic[];
}

export interface WikiLink {
  readonly target: string;
  readonly displayText?: string;
  readonly position: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface MarkdownTask {
  readonly checked: boolean;
  readonly text: string;
  readonly line: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface ParsedNote extends FrontmatterParseResult {
  readonly inlineTags: readonly string[];
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly wikiLinks: readonly WikiLink[];
  readonly tasks: readonly MarkdownTask[];
}

export interface SerializableNote {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly body: string;
}
