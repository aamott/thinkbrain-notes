/**
 * Wiki-link index for backlinks: a forward map from each note's
 * `relativePath` to the wiki-link targets it contains, plus a reverse map from
 * a resolved note path back to the notes that link to it (backlinks).
 *
 * Platform-agnostic (no React/DOM/Node). The desktop app owns the event-driven
 * lifecycle wiring (workspace open/close, note mutations); this module only
 * provides pure data structures and builder/mutation functions.
 */

import { normalize, resolveWikiLinkTarget, type NoteIndexEntry } from "./linkResolver";
import type { ParsedNote } from "./note-model";

/** Input entry used to build the index: a note's path and its parsed form. */
export interface WikiLinkIndexInput {
  readonly relativePath: string;
  readonly parsedNote: ParsedNote;
}

/**
 * The wiki-link index.
 *
 * - `forward`: maps a note's `relativePath` to the raw wiki-link target strings
 *   it contains (deduplicated, order-preserving). Used to know what a note
 *   links to.
 * - `backlinks`: maps a resolved note `relativePath` to the notes that link to
 *   it. Used by the backlinks panel and graph view to compute edges.
 * - `unresolved`: maps a raw target string (that did not resolve to any note)
 *   to the notes that reference it. Lets a renamed note later surface dangling
 *   links that now point at it.
 * - `noteIndex`: the shared {@link NoteIndexEntry} list (fileName, title,
 *   aliases) that other features (clickable links, autocomplete) also consume.
 */
export interface WikiLinkIndex {
  /** note relativePath → raw wiki-link targets it contains. */
  readonly forward: ReadonlyMap<string, readonly string[]>;
  /** resolved note relativePath → notes linking to it (backlinks). */
  readonly backlinks: ReadonlyMap<string, readonly string[]>;
  /** unresolved raw target → notes referencing it. */
  readonly unresolved: ReadonlyMap<string, readonly string[]>;
  /** shared note index entries derived from parsed notes. */
  readonly noteIndex: readonly NoteIndexEntry[];
}

/**
 * Empty index, useful as a starting point for incremental builds.
 *
 * Frozen at the outer object so a careless cast (`as Map<...>`) on the
 * `ReadonlyMap` fields is still possible (Maps can't be truly frozen), but the
 * `noteIndex` array and the outer shape are protected from accidental
 * reassignment/extension. Callers that need a fresh mutable starting point
 * should build via {@link buildWikiLinkIndex} with an empty input list.
 */
export const EMPTY_WIKI_LINK_INDEX: WikiLinkIndex = Object.freeze({
  forward: new Map<string, readonly string[]>(),
  backlinks: new Map<string, readonly string[]>(),
  unresolved: new Map<string, readonly string[]>(),
  noteIndex: Object.freeze([]) as readonly NoteIndexEntry[]
}) as WikiLinkIndex;

/**
 * Builds a {@link NoteIndexEntry} from a note's path and parsed form.
 *
 * Extracts `fileName`, `title`, and `aliases` so the entry can feed
 * {@link resolveWikiLinkTarget} and other consumers (autocomplete, clickable
 * links) without re-parsing the note.
 */
export function buildNoteIndexEntry(input: WikiLinkIndexInput): NoteIndexEntry {
  const { relativePath, parsedNote } = input;
  return {
    relativePath,
    fileName: relativePath.split("/").pop() ?? relativePath,
    title: parsedNote.metadata.title,
    aliases: parsedNote.aliases
  };
}

/**
 * Deduplicates wiki-link targets from a parsed note, preserving first-seen
 * order. Deduplication uses the resolver's {@link normalize} so `[[My Note]]`
 * and `[[my note]]` (and `[[My Note.md]]`) are not stored as separate targets,
 * and stays in sync with how the resolver matches.
 */
function dedupeTargets(parsedNote: ParsedNote): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const link of parsedNote.wikiLinks) {
    const key = normalize(link.target);
    if (!seen.has(key)) {
      seen.add(key);
      targets.push(link.target);
    }
  }
  return targets;
}

/**
 * Recomputes the `backlinks` and `unresolved` reverse maps from a forward map
 * and note index.
 *
 * This is the single source of truth for the reverse maps: given the forward
 * links and the current note index, every target is resolved and routed to
 * either `backlinks` (resolved) or `unresolved`. Recomputing on each mutation
 * keeps the logic simple and correct — a note whose title/alias changed can
 * newly resolve (or unresolve) links from *other* notes, which a per-note
 * patch would miss.
 */
function buildReverseMaps(
  forward: ReadonlyMap<string, readonly string[]>,
  noteIndex: readonly NoteIndexEntry[]
): { backlinks: Map<string, string[]>; unresolved: Map<string, string[]> } {
  const backlinks = new Map<string, string[]>();
  const unresolved = new Map<string, string[]>();

  for (const [sourcePath, targets] of forward) {
    for (const target of targets) {
      const resolvedPath = resolveWikiLinkTarget(target, noteIndex);
      const map = resolvedPath === null ? unresolved : backlinks;
      const key = resolvedPath ?? target;
      const list = map.get(key);
      if (list) {
        if (!list.includes(sourcePath)) list.push(sourcePath);
      } else {
        map.set(key, [sourcePath]);
      }
    }
  }

  return { backlinks, unresolved };
}

/**
 * Assembles a full {@link WikiLinkIndex} from a forward map and note index by
 * recomputing the reverse maps. Shared by {@link buildWikiLinkIndex},
 * {@link removeNote}, and {@link addNote} so the reverse-map rebuild stays in
 * one place.
 */
function finalizeWikiLinkIndex(
  forward: ReadonlyMap<string, readonly string[]>,
  noteIndex: readonly NoteIndexEntry[]
): WikiLinkIndex {
  const { backlinks, unresolved } = buildReverseMaps(forward, noteIndex);
  return { forward, backlinks, unresolved, noteIndex };
}

/**
 * Builds the full wiki-link index from a set of parsed notes.
 *
 * Steps:
 *  1. Builds the shared note index entries.
 *  2. Extracts deduplicated wiki-link targets from each note (forward map).
 *  3. Resolves each target against the note index and populates the backlinks
 *     reverse map and the unresolved map.
 *
 * Args:
 *   inputs: `{ relativePath, parsedNote }` entries for every note in the vault.
 *
 * Returns:
 *   A fully populated {@link WikiLinkIndex}.
 */
export function buildWikiLinkIndex(
  inputs: readonly WikiLinkIndexInput[]
): WikiLinkIndex {
  const noteIndex = inputs.map(buildNoteIndexEntry);

  const forward = new Map<string, string[]>();
  for (const { relativePath, parsedNote } of inputs) {
    forward.set(relativePath, dedupeTargets(parsedNote));
  }

  return finalizeWikiLinkIndex(forward, noteIndex);
}

/**
 * Returns the list of notes that link to `relativePath` (backlinks), or an
 * empty array if nothing links to it.
 */
export function getBacklinks(
  index: WikiLinkIndex,
  relativePath: string
): readonly string[] {
  return index.backlinks.get(relativePath) ?? [];
}

/**
 * Returns the raw wiki-link targets contained in the note at `relativePath`,
 * or an empty array if the note is not indexed.
 */
export function getForwardLinks(
  index: WikiLinkIndex,
  relativePath: string
): readonly string[] {
  return index.forward.get(relativePath) ?? [];
}

/**
 * Returns the notes that reference the unresolved raw `target`, or an empty
 * array if the target resolves or is not referenced.
 */
export function getUnresolvedReferences(
  index: WikiLinkIndex,
  target: string
): readonly string[] {
  return index.unresolved.get(target) ?? [];
}

/**
 * Removes a note from the index, returning a new (immutable) index.
 *
 * Drops the note's forward links, removes it from the note index, and
 * recomputes the backlinks/unresolved reverse maps so links from other notes
 * that previously resolved via this note's title/alias become unresolved.
 */
export function removeNote(
  index: WikiLinkIndex,
  relativePath: string
): WikiLinkIndex {
  const forward = new Map(index.forward);
  forward.delete(relativePath);

  const noteIndex = index.noteIndex.filter((n) => n.relativePath !== relativePath);

  return finalizeWikiLinkIndex(forward, noteIndex);
}

/**
 * Adds or updates a note in the index, returning a new (immutable) index.
 *
 * Accepts a {@link WikiLinkIndexInput} (`relativePath` + `parsedNote`) and
 * builds the {@link NoteIndexEntry} internally via {@link buildNoteIndexEntry},
 * so the entry and parsed note can never disagree (the previous
 * `(index, entry, parsedNote)` signature let a caller pass a mismatched pair
 * and silently corrupt the index). Upserts the entry, replaces the note's
 * forward links with freshly extracted targets, and recomputes the
 * backlinks/unresolved reverse maps. Recomputing handles the case where a
 * note's title/alias changed and links from *other* notes now resolve (or
 * unresolve) differently.
 */
export function addNote(
  index: WikiLinkIndex,
  input: WikiLinkIndexInput
): WikiLinkIndex {
  const entry = buildNoteIndexEntry(input);
  const forward = new Map(index.forward);
  forward.set(entry.relativePath, dedupeTargets(input.parsedNote));

  // Upsert the note index entry by relativePath.
  const existingIdx = index.noteIndex.findIndex(
    (n) => n.relativePath === entry.relativePath
  );
  const noteIndex =
    existingIdx >= 0
      ? [
          ...index.noteIndex.slice(0, existingIdx),
          entry,
          ...index.noteIndex.slice(existingIdx + 1)
        ]
      : [...index.noteIndex, entry];

  return finalizeWikiLinkIndex(forward, noteIndex);
}
