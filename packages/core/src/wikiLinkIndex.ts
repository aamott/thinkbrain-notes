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

/** A normalized wiki-link target paired with its source-line context. */
export interface IndexedWikiLink {
  readonly target: string;
  readonly context: string;
}

/** A source note linking to a target, paired with the source-line context. */
export interface BacklinkDetail {
  readonly relativePath: string;
  readonly context: string;
}

/** Input entry used to build the index from a note's exact source and parsed form. */
export interface WikiLinkIndexInput {
  readonly relativePath: string;
  readonly contents: string;
  readonly parsedNote: ParsedNote;
}

/**
 * The wiki-link index.
 *
 * - `forward`: maps a note's `relativePath` to wiki-link targets and source-line
 *   contexts (normalized-deduplicated, order-preserving). Used to know what a
 *   note links to.
 * - `backlinks`: maps a resolved note `relativePath` to the notes that link to
 *   it. Used by the backlinks panel and graph view to compute edges.
 * - `unresolved`: maps a raw target string (that did not resolve to any note)
 *   to the notes that reference it. Lets a renamed note later surface dangling
 *   links that now point at it.
 * - `noteIndex`: the shared {@link NoteIndexEntry} list (fileName, title,
 *   aliases) that other features (clickable links, autocomplete) also consume.
 */
export interface WikiLinkIndex {
  /** note relativePath → wiki-link targets and their source-line contexts. */
  readonly forward: ReadonlyMap<string, readonly IndexedWikiLink[]>;
  /** resolved note relativePath → source notes and contexts linking to it. */
  readonly backlinks: ReadonlyMap<string, readonly BacklinkDetail[]>;
  /** unresolved raw target → source notes and contexts referencing it. */
  readonly unresolved: ReadonlyMap<string, readonly BacklinkDetail[]>;
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
  forward: new Map<string, readonly IndexedWikiLink[]>(),
  backlinks: new Map<string, readonly BacklinkDetail[]>(),
  unresolved: new Map<string, readonly BacklinkDetail[]>(),
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

/** Returns the trimmed source line containing an offset in the exact note text. */
function sourceLineAt(contents: string, offset: number): string {
  const safeOffset = Math.max(0, Math.min(offset, contents.length));
  const lineStart = contents.lastIndexOf("\n", Math.max(0, safeOffset - 1)) + 1;
  const nextNewline = contents.indexOf("\n", safeOffset);
  const lineEnd = nextNewline === -1 ? contents.length : nextNewline;
  return contents.slice(lineStart, lineEnd).trim();
}

/**
 * Deduplicates normalized wiki-link targets while retaining the first target's
 * exact source-line context and first-seen order.
 */
function dedupeLinks(input: WikiLinkIndexInput): IndexedWikiLink[] {
  const seen = new Set<string>();
  const links: IndexedWikiLink[] = [];
  for (const link of input.parsedNote.wikiLinks) {
    const key = normalize(link.target);
    if (!seen.has(key)) {
      seen.add(key);
      links.push({
        target: link.target,
        context: sourceLineAt(input.contents, link.startOffset)
      });
    }
  }
  return links;
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
  forward: ReadonlyMap<string, readonly IndexedWikiLink[]>,
  noteIndex: readonly NoteIndexEntry[]
): {
  backlinks: Map<string, BacklinkDetail[]>;
  unresolved: Map<string, BacklinkDetail[]>;
} {
  const backlinks = new Map<string, BacklinkDetail[]>();
  const unresolved = new Map<string, BacklinkDetail[]>();

  for (const [sourcePath, links] of forward) {
    for (const { target, context } of links) {
      const resolvedPath = resolveWikiLinkTarget(target, noteIndex);
      const map = resolvedPath === null ? unresolved : backlinks;
      const key = resolvedPath ?? target;
      const detail = { relativePath: sourcePath, context };
      const list = map.get(key);
      if (list) list.push(detail);
      else map.set(key, [detail]);
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
  forward: ReadonlyMap<string, readonly IndexedWikiLink[]>,
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
 *   inputs: `{ relativePath, contents, parsedNote }` entries for every note.
 *
 * Returns:
 *   A fully populated {@link WikiLinkIndex}.
 */
export function buildWikiLinkIndex(
  inputs: readonly WikiLinkIndexInput[]
): WikiLinkIndex {
  const noteIndex = inputs.map(buildNoteIndexEntry);

  const forward = new Map<string, IndexedWikiLink[]>();
  for (const input of inputs) {
    forward.set(input.relativePath, dedupeLinks(input));
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
  return (index.backlinks.get(relativePath) ?? []).map(
    (detail) => detail.relativePath
  );
}

/** Returns backlink source paths and source-line contexts for a note. */
export function getBacklinkDetails(
  index: WikiLinkIndex,
  relativePath: string
): readonly BacklinkDetail[] {
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
  return (index.forward.get(relativePath) ?? []).map((link) => link.target);
}

/**
 * Returns the notes that reference the unresolved raw `target`, or an empty
 * array if the target resolves or is not referenced.
 */
export function getUnresolvedReferences(
  index: WikiLinkIndex,
  target: string
): readonly string[] {
  return (index.unresolved.get(target) ?? []).map(
    (detail) => detail.relativePath
  );
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
 * Accepts a {@link WikiLinkIndexInput} (path + exact contents + parsed note) and
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
  forward.set(entry.relativePath, dedupeLinks(input));

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
