/**
 * One subscription to everything that can happen to a note in a workspace.
 *
 * The four `note.*` events are announced separately because consumers like the
 * search index act differently on each. Other consumers only care that
 * *something* moved — the explorer re-lists the folder either way — or need to
 * switch on the kind in one place. Those had been repeating the same four
 * `appEvents.on` calls and the same root comparison; this is that shape, once.
 *
 * Compare `subscribeIndexToNoteEvents`, which is the other shape: a fixed
 * dispatch to an updater's three methods, for the two derived indexes.
 */

import { appEvents, type NoteChangeOrigin } from "./appEvents";
import type { Disposable } from "@thinkbrain/core";

/** Something that happened to one note, with the paths that describe it. */
export type NoteChange =
  | { readonly kind: "created"; readonly relativePath: string; readonly origin: NoteChangeOrigin }
  | { readonly kind: "saved"; readonly relativePath: string; readonly origin: NoteChangeOrigin }
  | { readonly kind: "deleted"; readonly relativePath: string; readonly origin: NoteChangeOrigin }
  | {
      readonly kind: "renamed";
      readonly oldRelativePath: string;
      readonly newRelativePath: string;
      readonly origin: NoteChangeOrigin;
    };

/**
 * Calls `onChange` for every note change in the workspace `currentRootPath`
 * names, and returns a function that stops listening.
 *
 * `currentRootPath` is asked at delivery time rather than captured, so a
 * subscriber whose workspace can be switched underneath it does not have to
 * tear the subscription down and build it again. Returning `null` from it
 * ignores everything, which is what having no workspace open should do.
 */
export function subscribeToNoteChanges(
  currentRootPath: () => string | null | undefined,
  onChange: (change: NoteChange) => void
): () => void {
  const forThisWorkspace = (rootPath: string) => rootPath === currentRootPath();

  const disposables: readonly Disposable[] = [
    appEvents.on("note.created", ({ rootPath, relativePath, origin }) => {
      if (!forThisWorkspace(rootPath)) return;
      onChange({ kind: "created", relativePath, origin: origin ?? "local" });
    }),
    appEvents.on("note.saved", ({ rootPath, relativePath, origin }) => {
      if (!forThisWorkspace(rootPath)) return;
      onChange({ kind: "saved", relativePath, origin: origin ?? "local" });
    }),
    appEvents.on("note.deleted", ({ rootPath, relativePath, origin }) => {
      if (!forThisWorkspace(rootPath)) return;
      onChange({ kind: "deleted", relativePath, origin: origin ?? "local" });
    }),
    appEvents.on("note.renamed", ({ rootPath, oldRelativePath, newRelativePath, origin }) => {
      if (!forThisWorkspace(rootPath)) return;
      onChange({
        kind: "renamed",
        oldRelativePath,
        newRelativePath,
        origin: origin ?? "local"
      });
    })
  ];

  return () => {
    for (const disposable of disposables) void disposable.dispose();
  };
}
