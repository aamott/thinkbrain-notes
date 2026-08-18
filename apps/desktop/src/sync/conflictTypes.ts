/**
 * The shapes the native side sends when two versions of a note exist.
 *
 * Mirrors `src-tauri/src/commands/sync/{merge,resolve}.rs`. The native side
 * never sends a conflict marker or a diff — only chunks, which is what lets
 * this UI be a list of choices rather than a text editor with a syntax to
 * explain.
 */

/** Whether the two versions can be compared line by line at all. */
export type ConflictKind = "text" | "binary";

/** One stretch of the comparison. */
export type ConflictChunk =
  | { readonly kind: "common"; readonly text: string }
  /**
   * The versions disagree here. Either side may be an empty string — that is
   * something one side added, offered against the choice of leaving it out.
   */
  | { readonly kind: "choice"; readonly ours: string; readonly theirs: string };

/** One side of a conflict, as a card or a column header shows it. */
export interface ConflictVersion {
  /** Workspace-relative, forward slashes. */
  readonly path: string;
  /** Whose version this is, in the user's terms: "This computer", "OneDrive". */
  readonly label: string;
  readonly byteSize: number;
  /** Milliseconds since the epoch, or `null` if the filesystem would not say. */
  readonly changedAt: number | null;
  /**
   * What this side was when it was read. Sent back with the decision so the
   * native side can refuse to write over a version nobody has seen.
   */
  readonly fingerprint: string;
}

/**
 * A conflict as the triage list shows it.
 *
 * `theirs.path` is the handle for everything else — reading the comparison and
 * resolving it both name the conflict by the copy.
 */
export interface ConflictSummary {
  readonly kind: ConflictKind;
  readonly ours: ConflictVersion;
  readonly theirs: ConflictVersion;
}

/** A conflict with its comparison. Empty `chunks` when `kind` is binary. */
export interface ConflictComparison extends ConflictSummary {
  readonly chunks: readonly ConflictChunk[];
}

/** What the user decided. */
export type ConflictResolution =
  | { readonly kind: "keepOurs" }
  | { readonly kind: "keepTheirs" }
  /** Keep both, renaming the copy after whoever made it. */
  | { readonly kind: "keepBoth" }
  /** Assembled chunk by chunk in the merge view. */
  | { readonly kind: "merged"; readonly contents: string };

/** Where things ended up. */
export interface ConflictResolved {
  readonly note: string;
  /** Where the other version was kept, if it was. */
  readonly keptAs: string | null;
  readonly checkpoint: string;
}
