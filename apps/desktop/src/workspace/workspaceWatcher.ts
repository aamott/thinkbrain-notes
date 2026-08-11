import { listen } from "@tauri-apps/api/event";

import { appEvents } from "../events/appEvents";
import { invokeNativeCommand } from "../native/commands";

/**
 * Turns edits made outside the app into the events the app already understands.
 *
 * The native watcher reports which workspace-relative paths changed and how; it
 * deliberately does no parsing, because note parsing has one home in the shared
 * core (OI-005). This module is the whole translation: a disk change becomes the
 * same `note.*` event an in-app edit produces, so the search index, the
 * wiki-link index and the calendar stay fresh without knowing a watcher exists.
 *
 * The native side already drops the echoes of the app's own writes, so anything
 * arriving here is genuinely someone else's work.
 */

/** The native event carrying a settled batch of changes. */
const WORKSPACE_CHANGED_EVENT = "workspace://changed";

/**
 * How many changes are worth applying individually before rebuilding instead.
 *
 * Matches the full-index path's own batch size, which is the scale at which
 * that path was judged worth batching in the first place.
 */
const MAX_INDIVIDUAL_CHANGES = 50;

/** One reportable change, mirroring the native `WorkspaceChange`. */
export interface WorkspaceChange {
  readonly kind: "created" | "modified" | "deleted" | "renamed" | "rescan";
  /** Workspace-relative, forward slashes. Empty for a rescan. */
  readonly path: string;
  /** Where a renamed note came from. */
  readonly oldPath?: string;
}

interface WorkspaceChangedPayload {
  readonly rootPath: string;
  readonly changes: readonly WorkspaceChange[];
}

/**
 * Emits the note events describing `changes`.
 *
 * `rootPath` is the caller's spelling of the workspace root rather than the
 * canonical one the watcher reports, because every index guards its updates
 * against the exact string its workspace was opened with.
 */
export function applyWorkspaceChanges(
  rootPath: string,
  changes: readonly WorkspaceChange[],
  onRescan: () => void
): void {
  // Every change costs a read, a parse and an index write in each derived
  // index, and nothing here throttles them. A checkout or a sync client can
  // settle thousands at once. A full rebuild reads more, but it batches, yields
  // between batches and can be aborted by a workspace switch — so past this
  // point it is both cheaper and better behaved than the trickle.
  if (changes.length > MAX_INDIVIDUAL_CHANGES) {
    onRescan();
    return;
  }

  for (const change of changes) {
    switch (change.kind) {
      case "created":
        appEvents.emit("note.created", { rootPath, relativePath: change.path });
        break;
      case "modified":
        // An outside edit and an in-app save are the same fact: the bytes
        // changed. Reusing `note.saved` is what keeps consumers unchanged.
        appEvents.emit("note.saved", { rootPath, relativePath: change.path });
        break;
      case "deleted":
        appEvents.emit("note.deleted", { rootPath, relativePath: change.path });
        break;
      case "renamed":
        if (change.oldPath === undefined) {
          // Without an origin there is no entry to move, but the file is real
          // and unindexed; treating it as new beats dropping it.
          appEvents.emit("note.created", { rootPath, relativePath: change.path });
          break;
        }
        appEvents.emit("note.renamed", {
          rootPath,
          oldRelativePath: change.oldPath,
          newRelativePath: change.path
        });
        break;
      case "rescan":
        onRescan();
        break;
      default:
        // A kind this build does not know about. Ignoring it keeps the rest of
        // the batch flowing rather than failing the whole delivery.
        console.warn("[watcher] Ignoring unrecognised change kind.", change);
        break;
    }
  }
}

/**
 * Starts watching `rootPath` and returns a function that stops.
 *
 * `onRescan` runs when the change cannot be described path by path — a deleted
 * folder takes its notes with it and the OS names only the folder — so the
 * caller rebuilds from disk instead.
 */
export async function watchWorkspace(
  rootPath: string,
  onRescan: () => void
): Promise<() => void> {
  // The watcher tags events with the canonical root, which need not match the
  // caller's spelling; comparing against the wrong one would silently ignore
  // every event.
  const canonicalRoot = await invokeNativeCommand("watch_workspace", { rootPath });

  const unlisten = await listen<WorkspaceChangedPayload>(WORKSPACE_CHANGED_EVENT, (event) => {
    // Every window hears every workspace; only this one's changes are ours.
    if (event.payload.rootPath !== canonicalRoot) return;
    applyWorkspaceChanges(rootPath, event.payload.changes, onRescan);
  });

  return () => {
    unlisten();
    // Released by the canonical root, not the caller's spelling: this often
    // runs because the folder was deleted or unmounted, and re-resolving a path
    // that no longer exists would fail exactly when releasing matters most.
    void invokeNativeCommand("unwatch_workspace", { canonicalRoot }).catch((error: unknown) => {
      console.warn("[watcher] Failed to stop watching the workspace.", error);
    });
  };
}
