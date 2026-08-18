/**
 * The shapes the native side sends about what has been recorded.
 *
 * Mirrors `src-tauri/src/commands/sync/{history,status}.rs`. Ids are opaque
 * handles: they name a recorded change so a restore can ask for it again, and
 * nothing in the UI is entitled to read anything into them.
 */

export type NoteChangeKind = "added" | "updated" | "removed";

export interface ChangedNote {
  /** Workspace-relative, forward slashes. */
  readonly path: string;
  readonly change: NoteChangeKind;
}

/** One recorded change, as the history list shows it. */
export interface RecordedChange {
  readonly id: string;
  /** Milliseconds since the epoch, or `null` if the record would not say. */
  readonly at: number | null;
  /**
   * Exactly as recorded. Shown behind a disclosure as the escape hatch for
   * anyone who would rather read the record than our rendering of it.
   */
  readonly message: string;
  readonly notes: readonly ChangedNote[];
}

/** Where a restored version came from. */
export interface RestoredVersion {
  readonly note: string;
  readonly checkpoint: string;
}

/** How often this vault has asked its user to choose between two versions. */
export interface ConflictRate {
  readonly decisions: number;
  readonly recorded: number;
}

/** What the status footer is saying, in order of who needs to act. */
export type SyncState = "off" | "problem" | "attention" | "saving" | "idle";

export interface SyncProblem {
  readonly code: string;
  readonly message: string;
}

export interface SyncStatus {
  readonly state: SyncState;
  /** When the last change was recorded, in milliseconds since the epoch. */
  readonly lastRecordedAt: number | null;
  readonly waiting: number;
  readonly attention: number;
  readonly problem: SyncProblem | null;
}

/** What a window shows before it has heard anything, and if it never does. */
export const NOT_RECORDING: SyncStatus = {
  state: "off",
  lastRecordedAt: null,
  waiting: 0,
  attention: 0,
  problem: null
};
