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

/** How often this vault has asked its user to choose between two versions. */
export interface ConflictRate {
  /** Conflicts the user was asked about. */
  readonly decisions: number;
  /**
   * Conflicts that carried nothing to decide and were settled without asking.
   *
   * Kept apart from `decisions` because the difference between them is the
   * number that decides whether merging against a shared base is worth it.
   */
  readonly settled: number;
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
  /**
   * Whether this folder is also a git repository of the user's own.
   *
   * The history panel and footer pill explain that both histories are being
   * kept here, so someone hears it from the app rather than discovering it.
   */
  readonly alongsideOwnGit: boolean;
}

/** What a window shows before it has heard anything, and if it never does. */
export const NOT_RECORDING: SyncStatus = {
  state: "off",
  lastRecordedAt: null,
  waiting: 0,
  attention: 0,
  problem: null,
  alongsideOwnGit: false
};

/** What became of the notes we tried to send on. */
export type SyncLanded =
  | { readonly state: "moved" }
  /** Retained as a native diagnostic; the UI gives a stable, actionable message instead. */
  | { readonly state: "refused"; readonly reason: string };

/** What one round trip to another device did. */
export interface Synced {
  /** Notes the other side's work changed here. */
  readonly broughtDown: number;
  /** Notes that needed a person, left as copies beside their originals. */
  readonly askedAbout: number;
  /**
   * Objects sent onward. This is intentionally not shown as a note count:
   * native push reports packed git objects, not notes.
   */
  readonly sent: number;
  readonly landed: SyncLanded;
}
