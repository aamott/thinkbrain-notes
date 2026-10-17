/**
 * The shapes the native side sends when two versions of a note exist.
 *
 * Mirrors `src-tauri/src/commands/sync/{merge,merge_base,resolve}.rs`. The native side
 * never sends a conflict marker or a diff — only the two complete documents,
 * which is what lets this UI compare them with its own differ rather than
 * explain a serialisation format.
 */

/** Whether the two versions can be compared line by line at all. */
export type ConflictKind = "text" | "binary";

/** One side of a conflict, as a card or a column header shows it. */
interface ConflictVersion {
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

/** Whether this is two versions of a note, or keep-versus-delete. */
type ConflictDecision = "versions" | "keepOrDelete";

/**
 * A conflict as the triage list shows it.
 *
 * `theirs.path` is the handle for everything else — reading the comparison and
 * resolving it both name the conflict by the copy.
 */
export interface ConflictSummary {
  readonly kind: ConflictKind;
  /** Absent on older payloads; treated as two versions. */
  readonly decision?: ConflictDecision;
  readonly ours: ConflictVersion;
  readonly theirs: ConflictVersion;
}

/**
 * A comparison's complete documents.
 *
 * `incoming` is the conflict copy — the other device's version, on the left.
 * `current` is this computer's version as the user sees it: the open editor's
 * buffer when there is one, else what is on disk.
 */
interface ConflictText {
  readonly incoming: string;
  readonly current: string;
}

/**
 * The version both sides grew from, and how far a merge against it can be
 * trusted.
 *
 * `confidence` describes what merging against this base would do, not where
 * the base came from: `proven` means it cannot drop a line of ours, while
 * `ambiguous` means it might take theirs somewhere ours never changed, so a
 * person has to look.
 */
interface ConflictBase {
  /** Opaque handle. */
  readonly id: string;
  /** The pull's own merge, or a version this vault recorded before the copy arrived. */
  readonly source: "merge" | "recorded";
  readonly confidence: "proven" | "ambiguous";
  /** Places the merge would take theirs where ours equals the base. */
  readonly riskyHunks: number;
}

/**
 * A conflict with its comparison. `text` is `null` when `kind` is binary:
 * there is nothing to compare line by line, and the choice is between whole
 * files.
 *
 * `base` is `null` when there is no base to name; absent on older payloads.
 * Either way both versions are left for the user to compare.
 */
export type ConflictComparison = Omit<ConflictSummary, "kind"> & {
  readonly base?: ConflictBase | null;
} & (
    | { readonly kind: "text"; readonly text: ConflictText }
    | { readonly kind: "binary"; readonly text: null }
  );

/** What the user decided. */
export type ConflictResolution =
  | { readonly kind: "keepOurs" }
  | { readonly kind: "keepTheirs" }
  /** Keep both, renaming the copy after whoever made it. */
  | { readonly kind: "keepBoth" }
  /** Assembled by the merge view from the two versions it was shown. */
  | { readonly kind: "merged"; readonly contents: string }
  /** Keep the note; the other device had deleted it. */
  | { readonly kind: "keepNote" }
  /** Delete the note after a restore point is taken. */
  | { readonly kind: "deleteNote" };

/** Where things ended up. */
export interface ConflictResolved {
  readonly note: string;
  /** Where the other version was kept, if it was. */
  readonly keptAs: string | null;
  readonly checkpoint: string;
}
