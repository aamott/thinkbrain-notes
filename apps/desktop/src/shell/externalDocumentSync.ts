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

/** A tab whose contents should be read from disk again. */
export interface ReloadTarget {
  readonly tabId: string;
  readonly rootPath: string;
  readonly relativePath: string;
}

/**
 * Returns the open tabs that should be re-read because of `change`.
 *
 * Only an outside write to a file some tab is showing qualifies, and only when
 * that tab has no unsaved edits.
 *
 * Args:
 *   openDocuments: Every editor tab currently open, in this workspace.
 *   change: One note change, already filtered to this workspace.
 */
export function documentsToReload(
  openDocuments: readonly OpenDocument[],
  change: NoteChange
): readonly ReloadTarget[] {
  // A creation has no tab yet, a deletion leaves the buffer as the last copy of
  // the text, and a rename moves the tab rather than changing what it holds.
  if (change.kind !== "saved") return [];

  // Our own write. The bytes on disk came from this buffer, and re-reading them
  // would undo anything typed while the write was in flight.
  if (change.origin !== "external") return [];

  return openDocuments
    .filter((document) => document.relativePath === change.relativePath && !document.isDirty)
    .map(({ tabId, rootPath, relativePath }) => ({ tabId, rootPath, relativePath }));
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
