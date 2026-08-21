/**
 * Reaching the native history, restore and status layer.
 *
 * Thin on purpose, like `conflictService`. What counts as a recorded change,
 * which versions a note can be put back to, and whether recording is healthy
 * are all answered in Rust, because they have to hold for a vault no window is
 * looking at.
 */

import { invokeNativeCommand } from "../native/commands";
import { subscribeToSyncEvent } from "./syncEvents";
import type {
  ConflictRate,
  HistoryCleanup,
  HistoryUsage,
  RecordedChange,
  Synced,
  SyncStatus
} from "./historyTypes";

/** Fired when what the status footer would say about a workspace has changed. */
const SYNC_STATUS_EVENT = "sync://status";
/** Fired after a successful save of git-link credentials, for a one-shot toast. */
const SYNC_SETUP_EVENT = "sync://setup";

/**
 * How much history one read asks for.
 *
 * A page rather than everything: a vault years old has thousands of recorded
 * changes, and nobody scrolls past the first screen looking for last Tuesday.
 */
const HISTORY_PAGE = 60;

export function readSyncStatus(rootPath: string): Promise<SyncStatus> {
  return invokeNativeCommand("sync_status", { rootPath });
}

/**
 * One round trip to wherever this folder syncs to: bring down what changed
 * there, merge it, send ours back.
 *
 * Slow by nature — it is a network call around a merge — so a caller has to
 * expect to wait, and the native side keeps two of them from overlapping.
 */
export function syncNow(rootPath: string): Promise<Synced> {
  return invokeNativeCommand("sync_now", { rootPath });
}

/** Saves credentials, then immediately checks the git link. */
export function saveSyncCredentials(
  rootPath: string,
  destination: string,
  username: string,
  token: string
): Promise<Synced> {
  return invokeNativeCommand("save_sync_credentials", { rootPath, destination, username, token });
}

/**
 * The most recent recorded changes, newest first.
 *
 * `notePath` narrows the list to the changes that left content for one note,
 * which is exactly that note's list of restorable versions — the same reader,
 * asked a narrower question, so the two lists cannot disagree.
 */
export function readHistory(
  rootPath: string,
  notePath: string | null,
  limit: number = HISTORY_PAGE
): Promise<readonly RecordedChange[]> {
  return invokeNativeCommand("sync_history", { rootPath, notePath, limit });
}

/** Puts the version of `notePath` recorded in `change` back into the vault. */
export function restoreVersion(
  rootPath: string,
  notePath: string,
  change: string
): Promise<void> {
  return invokeNativeCommand("restore_version", { rootPath, notePath, change }).then(() => undefined);
}

export function readConflictRate(rootPath: string): Promise<ConflictRate> {
  return invokeNativeCommand("sync_conflict_rate", { rootPath });
}

export function readHistoryUsage(rootPath: string): Promise<HistoryUsage> {
  return invokeNativeCommand("sync_history_usage", { rootPath });
}

export function freeSyncSpace(rootPath: string): Promise<HistoryCleanup> {
  return invokeNativeCommand("sync_free_space", { rootPath });
}

export function clearUndoHistory(rootPath: string): Promise<HistoryCleanup> {
  return invokeNativeCommand("sync_clear_undo_history", { rootPath });
}

export function subscribeToSyncStatus(onChange: () => void): Promise<() => void> {
  return subscribeToSyncEvent(SYNC_STATUS_EVENT, onChange);
}

/** Fired after a successful save of git-link credentials — not after ordinary sync. */
export function subscribeToSetupSuccess(onChange: () => void): Promise<() => void> {
  return subscribeToSyncEvent(SYNC_SETUP_EVENT, onChange);
}
