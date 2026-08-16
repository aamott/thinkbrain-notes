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
      const lastSegment = normalizedPath.split("/").pop() ?? normalizedPath;
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
