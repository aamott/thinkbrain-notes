import type { Disposable } from "@thinkbrain/core";

import { appEvents } from "./appEvents";

/**
 * Keeps every derived index fed from one place.
 *
 * The search index and the wiki-link index are both caches of the same notes,
 * so they react to the same four events in the same way: a write reindexes one
 * path, a rename moves an entry, a delete drops one. Each store used to spell
 * that mapping out for itself, which meant a new event — or a new index, like
 * the frontmatter facets — had to be remembered in more than one file.
 *
 * Stores keep their own `rootPath` guard. This only decides which method a
 * given event calls, not whether the index is the right one to call it on.
 */

/** The slice of a derived index that note events drive. */
export interface NoteIndexUpdater {
  reindexDocument(rootPath: string, relativePath: string): void | Promise<void>;
  removeDocument(rootPath: string, relativePath: string): void | Promise<void>;
  reindexRenamedDocument(
    rootPath: string,
    oldRelativePath: string,
    newRelativePath: string
  ): void | Promise<void>;
}

/**
 * Subscribes `updater` to the note lifecycle and returns the unsubscribe.
 *
 * `updater` is a thunk, not a value, so Zustand stores can pass their `get`
 * directly and every event sees current state rather than whatever the store
 * held when the workspace opened.
 */
export function subscribeIndexToNoteEvents(updater: () => NoteIndexUpdater): () => void {
  const disposables: readonly Disposable[] = [
    appEvents.on("note.saved", ({ rootPath, relativePath }) => {
      void updater().reindexDocument(rootPath, relativePath);
    }),
    appEvents.on("note.created", ({ rootPath, relativePath }) => {
      void updater().reindexDocument(rootPath, relativePath);
    }),
    appEvents.on("note.renamed", ({ rootPath, oldRelativePath, newRelativePath }) => {
      void updater().reindexRenamedDocument(rootPath, oldRelativePath, newRelativePath);
    }),
    appEvents.on("note.deleted", ({ rootPath, relativePath }) => {
      void updater().removeDocument(rootPath, relativePath);
    })
  ];

  return () => {
    for (const disposable of disposables) void disposable.dispose();
  };
}
