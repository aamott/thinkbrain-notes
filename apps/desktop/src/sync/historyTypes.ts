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
export type SyncState = "off" | "problem" | "syncing" | "attention" | "saving" | "idle";

/** Named step of an in-flight round trip, so the footer can name it without git jargon. */
export type SyncPhase = "saving" | "checking" | "combining" | "sending";

/** Whether a git link has completed a round trip from this device. */
export type SyncHealth = "unknown" | "healthy" | "problem";

export interface SyncProblem {
  readonly code: string;
  readonly message: string;
  /** Sanitized transport diagnostic, available when it helps troubleshoot a link. */
  readonly details?: string;
}

/** A note that could not be written or recorded, with something to do about it. */
export interface StuckNote {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface SyncStatus {
  readonly state: SyncState;
  /** When the last change was recorded, in milliseconds since the epoch. */
  readonly lastRecordedAt: number | null;
  readonly waiting: number;
  readonly attention: number;
  readonly stuck: readonly StuckNote[];
  readonly problem: SyncProblem | null;
  /** Named step of an in-flight round trip, when one is running. */
  readonly phase: SyncPhase | null;
  /** Whether a git link has completed a round trip from this device. */
  readonly health: SyncHealth;
  /** When git sync last succeeded, in milliseconds since the epoch. */
  readonly lastCheckedAt: number | null;
  /**
   * Whether this folder is also a git repository of the user's own.
   *
   * The history panel and footer pill explain that both histories are being
   * kept here, so someone hears it from the app rather than discovering it.
   */
  readonly alongsideOwnGit: boolean;
  /**
   * A failure to tidy private undo history. Saving versions continues.
   */
  readonly maintenanceProblem: SyncProblem | null;
}

/** What a window shows before it has heard anything, and if it never does. */
export const NOT_RECORDING: SyncStatus = Object.freeze({
  state: "off",
  lastRecordedAt: null,
  waiting: 0,
  attention: 0,
  stuck: [],
  problem: null,
  phase: null,
  health: "unknown",
  lastCheckedAt: null,
  alongsideOwnGit: false,
  maintenanceProblem: null
});

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

/** How much the hidden undo history occupies on this computer. */
export interface HistoryUsage {
  readonly bytes: number;
}

/** What one tidy or clear pass did to on-disk usage. */
export interface HistoryCleanup {
  readonly bytesBefore: number;
  readonly bytesAfter: number;
  readonly reclaimed: number;
}

/** One reusable git sign-in, without its token. */
export interface SignInProfile {
  readonly id: string;
  readonly label: string;
  readonly host: string;
  readonly username: string;
}

export interface SelectedSignIn extends SignInProfile {
  readonly saved: boolean;
}

export interface LegacySignIn {
  readonly host: string;
  readonly username: string;
}

export type SignInStorage = "available" | "unavailable" | "unsupported";

export interface SignInStatus {
  readonly storage: SignInStorage;
  readonly storageMessage: string;
  readonly host: string | null;
  readonly selectedId: string | null;
  readonly selected: SelectedSignIn | null;
  readonly profiles: readonly SignInProfile[];
  readonly legacy: LegacySignIn | null;
}

export interface SavedSignIn {
  readonly profile: SignInProfile;
  readonly migrated: boolean;
}
