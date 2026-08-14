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

/**
 * What the native side calls a save it refused because the file had changed.
 *
 * Distinct from a write that failed: nothing is wrong, and there is nothing to
 * retry — there are two versions and the user has to say which one they want.
 */
export const NOTE_CONFLICT_ERROR_CODE = "workspace.note_conflict";

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
  // Nothing to redraw *and* nothing to correct. Both halves matter: a tab
  // showing the right text while believing disk holds something else would have
  // its next save refused over a difference nobody can see.
  if (current.contents === contents && current.diskContents === contents) return documents;

  return {
    ...documents,
    [tabId]: { contents, diskContents: contents, phase: "ready", error: null }
  };
}


/**
 * The text a save from this view must claim to be replacing, or `null` when the
 * view must not be saved at all.
 *
 * Both `null` cases are views that were never read successfully, so their
 * buffer is not a version of the file. The failed load is the one that bites:
 * its buffer is empty, and writing it would put nothing over a file the shell
 * could not even read.
 */
export function saveablePrecondition(document: DocumentViewState): string | null {
  if (document.phase === "loading") return null;
  return document.diskContents;
}


/**
 * Settles a tab once its save has landed.
 *
 * `writtenContents` is what was sent, which is not always what the tab shows —
 * a save is a round trip and the user can type through it. Recording the buffer
 * instead would leave the tab claiming a version that was never written, and
 * the next save would then be refused over the user's own keystrokes.
 */
export function applySavedDocument(
  documents: Record<string, DocumentViewState>,
  tabId: string,
  writtenContents: string
): Record<string, DocumentViewState> {
  const current = documents[tabId];
  // Closed while the save was in flight. The write still landed; there is just
  // no longer a tab to settle, and re-adding one would only be pruned again.
  if (!current) return documents;

  return {
    ...documents,
    [tabId]: {
      contents: current.contents,
      diskContents: writtenContents,
      phase: "ready",
      error: null
    }
  };
}


/**
 * Settles a tab whose save was refused because the file had changed.
 *
 * Not an error state: the text is still the user's only copy and they are being
 * asked which version they want, so the tab goes back to something they can
 * keep typing in. What it must *not* do is re-anchor to the newer file — that
 * would quietly arm the next save to overwrite it, which is the opposite of
 * what refusing this one was for.
 */
export function applyRefusedSave(
  documents: Record<string, DocumentViewState>,
  tabId: string
): Record<string, DocumentViewState> {
  const current = documents[tabId];
  if (!current) return documents;

  return { ...documents, [tabId]: { ...current, phase: "ready", error: null } };
}


/**
 * Re-points a tab's precondition at what disk holds, leaving the buffer alone.
 *
 * This is what "keep mine" costs. Dismissing the notice is not enough on its
 * own: the tab would still be computing its saves from the version the user
 * just declined, so the next one would be refused and the notice they dismissed
 * would come straight back, every time, with no way through.
 *
 * Re-anchoring is not the same as forcing the write. The next save is checked
 * against this text, so a *further* change landing after the user chose is
 * still caught — which is the whole point of having asked them.
 */
export function anchorDiskContents(
  documents: Record<string, DocumentViewState>,
  tabId: string,
  diskContents: string
): Record<string, DocumentViewState> {
  const current = documents[tabId];
  if (!current) return documents;
  if (current.diskContents === diskContents) return documents;

  return { ...documents, [tabId]: { ...current, diskContents } };
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
