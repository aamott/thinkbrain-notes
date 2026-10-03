# Cloud Conflict Merge Bases

## Goal

Give every conflict a base it can name — or an honest "none" — so three-way
merging never guesses. Git conflicts carry their exact base; daemon conflicts
select a validated recorded version.

## Design

A conflict is `(ours, theirs, base?, confidence)` regardless of producer.

- **Git copies** carry the exact per-file base blob: `apply::leave_copies`
  already has it via `Conflict::entries()[0]` — record its id on
  `ConflictCopy`.
- **Daemon copies**: candidates are recorded versions of `original` that
  predate the pair's arrival. Later snapshots are polluted by the daemon's
  winner-write at `original` and must be excluded. Arrival is bounded by the
  copy's mtime — a remote device's clock, so bound loosely.
- **Selection is validated, not similarity-based.** Risky hunks are where
  `ours == base && theirs != base` — a too-new base silently drops our edits
  there, while a too-old base only adds questions. Score candidates by
  risky-hunk count (run the three-way merge per candidate and count), take
  the minimum, tie-break older. A candidate whose diff to `theirs` deletes
  nothing can never drop our content — high confidence regardless of
  provenance.
- **Deterministic recompute** at conflict-open time: the recorded chain is
  the store — no pins, no sidecars. Recorded versions are never pruned, so
  bases survive restart, pruning, and undo clearing. Resolving one of
  several copies of a file re-derives the next copy's base.
- Confidence is a property of the merge outcome, not the heuristic. Zero
  risky hunks may auto-resolve; anything else is presented per-chunk.
  `has_recorded`'s `SCAN` bound makes "proven" checks negative-biased — a
  miss means manual review, never wrong data.

## Acceptance Criteria

- Git-sourced `ConflictCopy` names the exact base blob the merge computed.
- Daemon conflicts select among pre-arrival recorded versions by risky-hunk
  minimization, tie-breaking older; post-arrival snapshots are never
  candidates.
- Confidence travels with the conflict; ambiguous or absent bases leave both
  versions for manual review. No silently dropped edits.
- Tests: two devices from a shared baseline, offline edits, conflict after
  restart, missing/ambiguous base, multiple copies of one file.

## Known gaps (deferred)

- **Daemon re-delivery ("whack-a-mole")**: deleting a resolved copy does not
  stop the other device's daemon from delivering it again, re-raising the
  answered conflict. Noted in `resolve::discard`; needs a recently-answered
  memory or keep-both guidance — separate follow-up.

## Files

- `apps/desktop/src-tauri/src/commands/sync/{conflict,settle,resolve,history,apply}.rs`
- `apps/desktop/src/sync/mergeModel.ts`
