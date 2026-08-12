/**
 * Keeping open editor tabs level with the files they are showing.
 *
 * An editor tab is a copy of a file made when the tab opened. Until the file
 * watcher existed nothing could tell the shell that copy had gone out of date,
 * so a note edited in another program stayed on screen as it was and a save
 * from that tab put the stale text back over the newer file.
 *
 * The rule here is narrow on purpose: re-read only what can be re-read without
 * losing anything. Text the user has typed and not saved exists nowhere else,
 * so a tab holding some is never overwritten — it needs the user to choose
 * between the two versions, which is a question this module does not ask.
 */

import type { NoteChange } from "../events/noteChangeSubscription";
import type { DocumentViewState } from "./shellTypes";

/** An editor tab and the file it is showing. */
export interface OpenDocument {
  readonly tabId: string;
  readonly rootPath: string;
  readonly relativePath: string;
  /** Whether the tab holds edits that are not on disk. */
  readonly isDirty: boolean;
}

/** What an open tab needs doing about a file that changed underneath it. */
export type DocumentSyncAction =
  /** Nothing unsaved is at stake, so take what is on disk. */
  | {
      readonly kind: "reload";
      readonly tabId: string;
      readonly rootPath: string;
      readonly relativePath: string;
    }
  /** Two versions exist and only the user knows which one matters. */
  | { readonly kind: "conflict"; readonly tabId: string };

/**
 * Decides what `change` means for each open tab.
 *
 * Only an outside write to a file some tab is showing means anything here. A
 * tab with no unsaved edits can simply take the newer text; a tab with unsaved
 * edits cannot, because that text exists nowhere else.
 *
 * Args:
 *   openDocuments: Every editor tab currently open, in this workspace.
 *   change: One note change, already filtered to this workspace.
 */
export function planDocumentSync(
  openDocuments: readonly OpenDocument[],
  change: NoteChange
): readonly DocumentSyncAction[] {
  // A creation has no tab yet, a deletion leaves the buffer as the last copy of
  // the text, and a rename moves the tab rather than changing what it holds.
  if (change.kind !== "saved") return [];

  // Our own write. The bytes on disk came from this buffer, and re-reading them
  // would undo anything typed while the write was in flight.
  if (change.origin !== "external") return [];

  return openDocuments
    .filter((document) => document.relativePath === change.relativePath)
    .map(({ tabId, rootPath, relativePath, isDirty }) =>
      isDirty
        ? ({ kind: "conflict", tabId } as const)
        : ({ kind: "reload", tabId, rootPath, relativePath } as const)
    );
}

/** Notes that `tabId` is waiting on the user to choose between two versions. */
export function markConflict(
  conflicts: ReadonlySet<string>,
  tabId: string
): ReadonlySet<string> {
  if (conflicts.has(tabId)) return conflicts;
  return new Set(conflicts).add(tabId);
}

/** Forgets `tabId`'s conflict, once answered or made moot by a save. */
export function clearConflict(
  conflicts: ReadonlySet<string>,
  tabId: string
): ReadonlySet<string> {
  if (!conflicts.has(tabId)) return conflicts;
  const next = new Set(conflicts);
  next.delete(tabId);
  return next;
}

/**
 * Drops conflicts for tabs that are no longer open.
 *
 * A closed tab cannot answer, and the flag would come back to life if the same
 * file were opened again — a tab's id is built from its path.
 */
export function pruneConflicts(
  conflicts: ReadonlySet<string>,
  openTabIds: ReadonlySet<string>
): ReadonlySet<string> {
  if (conflicts.size === 0) return conflicts;
  const next = new Set([...conflicts].filter((tabId) => openTabIds.has(tabId)));
  return next.size === conflicts.size ? conflicts : next;
}

/**
 * Puts a re-read file back into its tab.
 *
 * Reading takes long enough that the tab can change underneath the read. Rather
 * than ask what changed, the caller says what the tab held when it decided to
 * re-read, and anything else means someone got there first — most likely the
 * user typing, whose keystrokes exist nowhere but that buffer.
 *
 * Args:
 *   documents: The shell's loaded tab contents, keyed by tab id.
 *   tabId: The tab the read was for.
 *   expectedContents: What that tab held when the re-read was decided on.
 *   contents: What the file turned out to hold.
 *
 * Returns:
 *   The same map when the read should be dropped or would change nothing, so
 *   an unchanged file costs no re-render.
 */
export function applyReloadedDocument(
  documents: Record<string, DocumentViewState>,
  tabId: string,
  expectedContents: string,
  contents: string
): Record<string, DocumentViewState> {
  const current = documents[tabId];
  if (!current) return documents;
  // Still loading or showing an error: no text to compare, and a read of its
  // own already under way.
  if (current.phase !== "ready") return documents;
  if (current.contents !== expectedContents) return documents;
  if (current.contents === contents) return documents;

  return { ...documents, [tabId]: { contents, phase: "ready", error: null } };
}

/**
 * Moves a tab's loaded text to the identity its renamed file now has.
 *
 * A tab is identified by the path of its file, so following a rename means the
 * tab's contents have to move with it. The text itself did not change, so it is
 * carried over rather than read again — which also keeps unsaved edits.
 */
export function moveDocumentView(
  documents: Record<string, DocumentViewState>,
  fromTabId: string,
  toTabId: string
): Record<string, DocumentViewState> {
  const moving = documents[fromTabId];
  if (!moving || fromTabId === toTabId) return documents;

  const next = { ...documents, [toTabId]: moving };
  delete next[fromTabId];
  return next;
}
