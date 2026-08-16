/**
 * Keeps the explorer tree level with the folder it is showing.
 *
 * The tree holds a flat listing of the whole workspace, and every in-app
 * create, rename and delete already refreshes it by re-listing. Changes made
 * outside the app take the same route: the events say a note moved, and the
 * listing says what the folder now holds — including the folders, images and
 * other files that no note event ever mentions.
 */

import { subscribeToNoteChanges } from "../events/noteChangeSubscription";
import { createDebounced } from "../lib/debounce";

/**
 * How long to wait for more changes before listing.
 *
 * The Rust watcher already settles the filesystem's own chatter; this only has
 * to gather the individual notes of one batch, which arrive together.
 */
export const EXPLORER_REFRESH_DELAY_MS = 120;

/**
 * Re-lists the workspace whenever a note is added, removed or renamed in it.
 *
 * Edits are deliberately not listened for: a save changes bytes, not the shape
 * of the tree, and the tree shows names.
 *
 * Args:
 *   currentRootPath: The workspace the tree is showing, asked at delivery time
 *     so switching workspaces does not need the subscription rebuilt.
 *   refresh: Re-lists the workspace and dispatches the result.
 *   delayMs: How long to gather changes before listing.
 *
 * Returns:
 *   A function that stops listening and drops any listing not yet made.
 */
export function subscribeExplorerToNoteChanges(
  currentRootPath: () => string | null | undefined,
  refresh: () => void,
  delayMs: number = EXPLORER_REFRESH_DELAY_MS
): () => void {
  const scheduleRefresh = createDebounced(refresh, delayMs);

  const stopListening = subscribeToNoteChanges(currentRootPath, (change) => {
    if (change.kind === "saved") return;
    scheduleRefresh();
  });

  return () => {
    // Order matters only for readability; both have to happen. A timer left
    // armed past teardown lists a workspace that is no longer open and
    // dispatches the result over the one that replaced it.
    scheduleRefresh.cancel();
    stopListening();
  };
}
