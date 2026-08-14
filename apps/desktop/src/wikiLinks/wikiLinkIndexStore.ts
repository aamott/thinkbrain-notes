/**
 * Zustand store for the wiki-link index lifecycle.
 *
 * Mirrors {@link useSearchIndexStore}: owns the in-memory
 * {@link WikiLinkIndex} for the current workspace, rebuilds it on workspace
 * open, clears it when no workspace is available, and keeps it in sync with
 * `note.saved`/`note.created`/`note.renamed`/`note.deleted` events via
 * {@link subscribeToEvents} — whether the app made the change or the native
 * watcher saw another program make it.
 *
 * The store is deliberately thin: parsing and native IPC (reading files) are
 * routed through `invokeNativeCommand` and `parseNote` from `@thinkbrain/core`.
 * UI consumers (backlinks panel, graph view) read `noteIndex` and call
 * `getBacklinks` to compute edges without re-parsing every note on each query.
 */

import { create } from "zustand";
import {
  addNote,
  buildWikiLinkIndex,
  EMPTY_WIKI_LINK_INDEX,
  removeNote,
  parseNote,
  type NoteIndexEntry,
  type ParsedNote,
  type WikiLinkIndex,
  type WikiLinkIndexInput
} from "@thinkbrain/core";
import { subscribeIndexToNoteEvents } from "../events/noteIndexSubscription";
import { invokeNativeCommand, type NativeMarkdownFileEntry } from "../native/commands";

/**
 * Tracks the current event subscription so `subscribeToEvents` is idempotent.
 * A second call disposes the first before creating a new one, preventing
 * React 18 strict-mode double-mount from leaking listeners.
 */
let currentSubscription: (() => void) | null = null;

/**
 * Tracks the in-flight full-index operation so a workspace switch can abort it.
 * Kept outside Zustand state because `AbortController` is mutable/non-serializable.
 * Mirrors {@link useSearchIndexStore}'s `indexingAbortController`.
 */
let indexingAbortController: AbortController | null = null;

/** State + actions exposed by the wiki-link index store. */
export interface WikiLinkIndexStore {
  /** Current wiki-link index, or the empty index when no workspace is open. */
  readonly wikiLinkIndex: WikiLinkIndex;
  /** Shared note index entries for the current workspace. */
  readonly noteIndex: readonly NoteIndexEntry[];
  /** Workspace root the index covers, or `null` when no workspace is open. */
  readonly rootPath: string | null;

  /** Reads, parses, and indexes all markdown files in the workspace. */
  indexWorkspace(rootPath: string, files: readonly NativeMarkdownFileEntry[]): Promise<void>;
  /** Resets to no-workspace and clears the index. */
  clearWorkspace(): void;
  /** Incrementally re-indexes a single document (upsert on save/create). */
  reindexDocument(rootPath: string, relativePath: string): Promise<void>;
  /** Removes the old path and indexes the new one for a renamed/moved note. */
  reindexRenamedDocument(
    rootPath: string,
    oldRelativePath: string,
    newRelativePath: string
  ): Promise<void>;
  /** Removes a document from the index. */
  removeDocument(rootPath: string, relativePath: string): void;
  /**
   * Subscribes to app-wide note mutation events and keeps the index in sync.
   * Idempotent: calling it again disposes the previous subscription before
   * creating a new one, so React 18 strict-mode double-mount does not leak
   * listeners. Returns a disposal function that unsubscribes all listeners.
   */
  subscribeToEvents(): () => void;
}

/**
 * Reads and parses a single markdown file from the workspace.
 *
 * Returns `null` when the file cannot be read or parsed so a single corrupt
 * note cannot abort the whole index; the caller skips `null` entries.
 */
async function readAndParse(
  rootPath: string,
  relativePath: string,
  signal?: AbortSignal
): Promise<{ relativePath: string; parsedNote: ParsedNote } | null> {
  try {
    const { contents } = await invokeNativeCommand("read_markdown_file", {
      rootPath,
      relativePath
    });
    // A superseding workspace switch may have aborted this read between the
    // IPC round-trip and the parse step; drop the result instead of committing.
    if (signal?.aborted) return null;
    return { relativePath, parsedNote: parseNote(contents) };
  } catch (error) {
    console.warn(
      `[wikiLinkIndexStore] Skipping "${relativePath}" during indexing:`,
      error
    );
    return null;
  }
}

/**
 * Upserts a parsed note into `index` and commits the result to the store.
 *
 * Shared by `reindexDocument` and `reindexRenamedDocument`, which both pass the
 * parsed note to `addNote` (which builds the {@link NoteIndexEntry} internally)
 * and replace the index state.
 */
function upsertNote(
  set: (partial: Partial<WikiLinkIndexStore>) => void,
  index: WikiLinkIndex,
  parsed: { relativePath: string; parsedNote: ParsedNote }
): void {
  const next = addNote(index, parsed);
  set({ wikiLinkIndex: next, noteIndex: next.noteIndex });
}

export const useWikiLinkIndexStore = create<WikiLinkIndexStore>((set, get) => ({
  wikiLinkIndex: EMPTY_WIKI_LINK_INDEX,
  noteIndex: [],
  rootPath: null,

  async indexWorkspace(rootPath, files) {
    // Abort any in-flight indexing from a previous workspace before starting.
    indexingAbortController?.abort();
    const controller = new AbortController();
    indexingAbortController = controller;

    set({ rootPath });
    try {
      // Reads within the workspace are independent; fire them together.
      const read = await Promise.all(
        files.map((file) => readAndParse(rootPath, file.relative_path, controller.signal))
      );
      const inputs: WikiLinkIndexInput[] = read.filter(
        (r): r is { relativePath: string; parsedNote: ParsedNote } => r !== null
      );

      // Guard against a superseding workspace switch overwriting stale results.
      // The abort check covers the case where `clearWorkspace` or a newer
      // `indexWorkspace` aborted this batch after its reads completed.
      if (controller.signal.aborted || get().rootPath !== rootPath) return;

      const index = buildWikiLinkIndex(inputs);
      set({ wikiLinkIndex: index, noteIndex: index.noteIndex });
    } catch (error) {
      console.error("[wikiLinkIndexStore] Indexing failed:", error);
      if (indexingAbortController === controller && get().rootPath === rootPath) {
        set({ wikiLinkIndex: EMPTY_WIKI_LINK_INDEX, noteIndex: [] });
      }
    } finally {
      if (indexingAbortController === controller) {
        indexingAbortController = null;
      }
    }
  },

  clearWorkspace() {
    // Abort any in-flight indexing so a closed workspace cannot commit stale reads.
    indexingAbortController?.abort();
    indexingAbortController = null;
    set({
      wikiLinkIndex: EMPTY_WIKI_LINK_INDEX,
      noteIndex: [],
      rootPath: null
    });
  },

  async reindexDocument(rootPath, relativePath) {
    if (get().rootPath !== rootPath) return;
    const parsed = await readAndParse(rootPath, relativePath);
    if (parsed === null) {
      // Keep the stale entry rather than silently dropping it; surface the
      // failure loudly so the developer knows the index is out of sync.
      console.error(
        `[wikiLinkIndexStore] Failed to reindex "${relativePath}"; index is stale.`
      );
      return;
    }
    if (get().rootPath !== rootPath) return;
    upsertNote(set, get().wikiLinkIndex, parsed);
  },

  async reindexRenamedDocument(rootPath, oldRelativePath, newRelativePath) {
    if (get().rootPath !== rootPath) return;
    // Read the new path FIRST so a read failure cannot delete the note from
    // the index. The old entry is only removed once the new path is parsed.
    const parsed = await readAndParse(rootPath, newRelativePath);
    if (parsed === null) {
      console.error(
        `[wikiLinkIndexStore] Failed to reindex renamed "${oldRelativePath}" -> "${newRelativePath}"; keeping old entry, index is stale.`
      );
      return;
    }
    if (get().rootPath !== rootPath) return;
    // Remove the old path and add the new one in a single commit so stale
    // links are cleared and the new entry lands atomically.
    const afterRemove = removeNote(get().wikiLinkIndex, oldRelativePath);
    upsertNote(set, afterRemove, parsed);
  },

  removeDocument(rootPath, relativePath) {
    if (get().rootPath !== rootPath) return;
    const next = removeNote(get().wikiLinkIndex, relativePath);
    set({ wikiLinkIndex: next, noteIndex: next.noteIndex });
  },

  subscribeToEvents() {
    // Dispose any existing subscription before creating a new one.
    if (currentSubscription) currentSubscription();

    const dispose = subscribeIndexToNoteEvents(get);
    currentSubscription = dispose;
    return () => {
      dispose();
      currentSubscription = null;
    };
  }
}));
