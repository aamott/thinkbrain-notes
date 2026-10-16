/**
 * Wiki-link target resolution: maps a `[[Target]]` string to a concrete note.
 *
 * Platform-agnostic (no React/DOM/Node). The caller supplies the vault's note
 * index entries; the resolver returns the winning note's vault-relative path or
 * `null` when no match exists.
 */

/** A note known to the resolver, derived from the vault's parsed notes. */
export interface NoteIndexEntry {
  /** Vault-relative path, e.g. `"folder/My Note.md"`. */
  readonly relativePath: string;
  /** File name with extension, e.g. `"My Note.md"`. */
  readonly fileName: string;
  /** Frontmatter `title`, if present. */
  readonly title?: string;
  /** Frontmatter `aliases`. */
  readonly aliases: readonly string[];
}

/**
 * Normalizes a string for case-insensitive, extension-insensitive comparison.
 *
 * Trims whitespace, lowercases, and strips a trailing `.md` (or `.markdown`)
 * extension so `[[My Note]]` matches `My Note.md`.
 *
 * Exported so the wiki-link indexer can dedupe targets with the exact same
 * normalization the resolver uses for matching — keeping the two in sync by
 * structure rather than by convention.
 */
export function normalize(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.replace(/\.(md|markdown)$/, "");
}

/**
 * Resolves a wiki-link `target` to a concrete note's vault-relative path.
 *
 * Resolution priority (first match wins):
 * 1. **Exact filename match** — `target` matches `fileName` without extension.
 * 2. **Frontmatter `title` match** — `target` matches the note's `title`.
 * 3. **Frontmatter `aliases` match** — `target` matches any alias.
 * 4. **Relative path match** — `target` matches `relativePath` with or without
 *    extension, or the last path segment of `relativePath`.
 *
 * All comparisons are case-insensitive and ignore `.md`/`.markdown` extension
 * differences, matching the indexer's behavior.
 *
 * When multiple notes match at the same priority level, the one with the
 * shortest `relativePath` wins (closest to vault root), then alphabetically
 * first as a final deterministic tie-break.
 *
 * Args:
 *   target: The raw `[[Target]]` string (without brackets).
 *   notes: All known notes in the vault.
 *
 * Returns:
 *   The winning note's `relativePath`, or `null` when no note matches.
 *   Unresolved links are tracked by the caller; this function never throws.
 */
export function resolveWikiLinkTarget(
  target: string,
  notes: readonly NoteIndexEntry[]
): string | null {
  const normalizedTarget = normalize(target);
  if (normalizedTarget === "") return null;

  // Each matcher extracts candidate strings from a note and checks if any
  // equals the normalized target. Priority is the array order: the first
  // level with any match wins.
  const matchers: readonly ((note: NoteIndexEntry) => readonly string[])[] = [
    (note) => [normalize(note.fileName)],
    (note) => (note.title !== undefined ? [normalize(note.title)] : []),
    (note) => note.aliases.map(normalize),
    (note) => {
      const normalizedPath = normalize(note.relativePath);
      const lastSegment = normalizedPath.split("/").pop()!;
      return [normalizedPath, lastSegment];
    }
  ];

  for (const matcher of matchers) {
    const matches = notes.filter((note) =>
      matcher(note).some((candidate) => candidate === normalizedTarget)
    );
    if (matches.length > 0) {
      // Tie-break: shortest path (closest to vault root), then alphabetical.
      matches.sort((a, b) =>
        a.relativePath.length !== b.relativePath.length
          ? a.relativePath.length - b.relativePath.length
          : a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0
      );
      return matches[0]!.relativePath;
    }
  }

  return null;
}

/** Where a `[text](target)` Markdown link points. */
export type MarkdownLinkTarget =
  | { readonly kind: "internal"; readonly relativePath: string }
  | { readonly kind: "external"; readonly url: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Joins `target` onto `containingPath`'s folder and collapses `.`/`..`
 * segments. A leading `/` targets the vault root. Returns `null` when the
 * result would escape the vault or names nothing.
 */
function joinRelative(target: string, containingPath: string | null | undefined): string | null {
  const base = containingPath?.split("/").slice(0, -1) ?? [];
  const parts = target.startsWith("/")
    ? target.split("/")
    : [...base, ...target.split("/")];
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (normalized.length === 0) return null;
      normalized.pop();
    } else {
      normalized.push(part);
    }
  }
  return normalized.length === 0 ? null : normalized.join("/");
}

/** `decodeURIComponent` that tolerates malformed `%` sequences. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** URL schemes the host may hand to the OS to open. */
const SAFE_EXTERNAL = /^(https?|mailto|tel):/i;

/**
 * Resolves a `[text](target)` target. Allowed external schemes (`https:`,
 * `mailto:`, `//host/…`) come back as URLs to hand the OS — anything else
 * (`javascript:`, `data:`, `file:`, …) returns `null` rather than reaching
 * an OS handler that might run it. Internal targets resolve relative to the
 * containing note's folder — a `#anchor` suffix addresses the file part
 * only — then match the note index exactly before falling back to
 * vault-wide lookup. Non-note files have no index entry, so an internal
 * target with a non-Markdown extension resolves optimistically; the opener
 * reports it if the file is not there.
 *
 * Returns `null` for empty targets, anchor-only targets (`#heading`),
 * disallowed schemes, and targets that escape the vault — callers render
 * those as broken.
 */
export function resolveMarkdownLinkTarget(
  target: string,
  containingPath: string | null | undefined,
  notes: readonly NoteIndexEntry[]
): MarkdownLinkTarget | null {
  const raw = target.trim();
  const unwrapped = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1).trim() : raw;
  if (unwrapped === "" || unwrapped.startsWith("#")) return null;
  if (unwrapped.startsWith("//")) {
    return { kind: "external", url: `https:${unwrapped}` };
  }
  if (SCHEME.test(unwrapped)) {
    return SAFE_EXTERNAL.test(unwrapped) ? { kind: "external", url: unwrapped } : null;
  }

  const filePart = safeDecode(unwrapped.split("#")[0]!.split("?")[0]!);
  const joined = filePart === "" ? null : joinRelative(filePart, containingPath);
  if (joined === null) return null;

  // The folder-relative spelling is tried before the verbatim target —
  // `./note` must not leap past a same-folder file to a root one — and the
  // verbatim lookup keeps bare-name `[x](note)` links working vault-wide.
  const viaIndex =
    resolveWikiLinkTarget(joined, notes) ?? resolveWikiLinkTarget(filePart, notes);
  if (viaIndex) return { kind: "internal", relativePath: viaIndex };

  if (/\.[a-z0-9]+$/i.test(joined) && !/\.(md|markdown)$/i.test(joined)) {
    return { kind: "internal", relativePath: joined };
  }
  return null;
}
