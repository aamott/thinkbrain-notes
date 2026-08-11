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
 */
function normalize(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.replace(/\.(md|markdown)$/, "");
}

/**
 * Compares two candidates for deterministic tie-breaking.
 *
 * Shortest `relativePath` wins (shallower notes are closer to the vault root
 * and more likely to be the intended target). Alphabetical order is the final
 * tie-break so the result is stable across runs and entry ordering.
 */
function compareCandidates(a: NoteIndexEntry, b: NoteIndexEntry): number {
  if (a.relativePath.length !== b.relativePath.length) {
    return a.relativePath.length - b.relativePath.length;
  }
  return a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0;
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

  // Check each priority level in order. The first level with any match wins.
  for (const level of [matchByFileName, matchByTitle, matchByAlias, matchByPath]) {
    const matches = level(normalizedTarget, notes);
    if (matches.length > 0) {
      matches.sort(compareCandidates);
      return matches[0]!.relativePath;
    }
  }

  return null;
}

function matchByFileName(
  target: string,
  notes: readonly NoteIndexEntry[]
): NoteIndexEntry[] {
  return notes.filter((note) => normalize(note.fileName) === target);
}

function matchByTitle(
  target: string,
  notes: readonly NoteIndexEntry[]
): NoteIndexEntry[] {
  return notes.filter((note) => note.title !== undefined && normalize(note.title) === target);
}

function matchByAlias(
  target: string,
  notes: readonly NoteIndexEntry[]
): NoteIndexEntry[] {
  return notes.filter((note) =>
    note.aliases.some((alias) => normalize(alias) === target)
  );
}

function matchByPath(
  target: string,
  notes: readonly NoteIndexEntry[]
): NoteIndexEntry[] {
  return notes.filter((note) => {
    const normalizedPath = normalize(note.relativePath);
    // Full path match (with or without extension) or last-segment match.
    if (normalizedPath === target) return true;
    const lastSegment = normalizedPath.split("/").pop() ?? normalizedPath;
    return lastSegment === target;
  });
}
