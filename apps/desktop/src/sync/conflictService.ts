/**
 * Reaching the native conflict layer, and hearing when it changes.
 *
 * Thin on purpose. Every decision about what a conflict *is* lives in Rust —
 * which files pair up, which provider made the copy, whether a comparison is
 * even possible — because the same answers have to hold for a vault nobody has
 * a window open on.
 */

import { listen } from "@tauri-apps/api/event";

import { invokeNativeCommand } from "../native/commands";
import type {
  ConflictComparison,
  ConflictResolution,
  ConflictResolved,
  ConflictSummary
} from "./conflictTypes";

/** Fired when the set of conflicts awaiting a decision is no longer what it was. */
const SYNC_CONFLICTS_EVENT = "sync://conflicts";

export function listConflicts(rootPath: string): Promise<readonly ConflictSummary[]> {
  return invokeNativeCommand("list_conflicts", { rootPath });
}

/**
 * The full comparison for one conflict.
 *
 * `buffer` is the text of an editor open on the note with unsaved changes. Pass
 * it and "this computer's version" becomes what the user is looking at, rather
 * than the last thing they saved — resolving against stale disk content would
 * throw away everything typed since.
 */
export function readConflict(
  rootPath: string,
  copyPath: string,
  buffer?: string | null
): Promise<ConflictComparison> {
  return invokeNativeCommand("read_conflict", { rootPath, copyPath, buffer: buffer ?? null });
}

/**
 * Carries out a decision.
 *
 * The two fingerprints come from the summary or comparison the decision was
 * made from. If either version has changed on disk since, the native side
 * refuses rather than writing over something nobody has seen, and throws
 * `sync.conflict_moved`.
 */
export function resolveConflict(
  rootPath: string,
  summary: ConflictSummary,
  resolution: ConflictResolution
): Promise<ConflictResolved> {
  return invokeNativeCommand("resolve_conflict", {
    rootPath,
    copyPath: summary.theirs.path,
    resolution,
    expectedOurs: summary.ours.fingerprint,
    expectedTheirs: summary.theirs.fingerprint
  });
}

/**
 * Calls `onChange` whenever this workspace's conflicts may have changed.
 *
 * The payload's workspace is deliberately not compared against `rootPath`. The
 * native side names workspaces by their canonical path, which need not match
 * the spelling this window was opened with, and a filter that got that wrong
 * would silently stop the list from ever refreshing. Re-reading the list is
 * cheap and authoritative, so an occasional re-read prompted by another
 * workspace costs one call and cannot be wrong.
 */
export async function subscribeToConflictChanges(onChange: () => void): Promise<() => void> {
  return listen(SYNC_CONFLICTS_EVENT, () => {
    onChange();
  });
}
