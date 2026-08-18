/**
 * Hearing that something about a workspace's sync has changed.
 *
 * Every one of these events names a workspace and carries nothing else. That
 * is deliberate: a payload of conflicts, or of a status, would go stale between
 * being built and being read, in a feature whose whole subject is two versions
 * of the truth. The answer is always one command away.
 */

import { listen } from "@tauri-apps/api/event";

/**
 * Calls `onChange` whenever the native side raises `event`.
 *
 * The payload's workspace is deliberately not compared against the caller's.
 * The native side names workspaces by their canonical path, which need not
 * match the spelling a window was opened with, and a filter that got that
 * wrong would silently stop a surface from ever refreshing. Re-reading is
 * cheap and authoritative, so an occasional re-read prompted by another
 * workspace costs one call and cannot be wrong.
 */
export async function subscribeToSyncEvent(
  event: string,
  onChange: () => void
): Promise<() => void> {
  return listen(event, () => {
    onChange();
  });
}
