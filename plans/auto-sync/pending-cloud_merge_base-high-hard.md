# Cloud Conflict Merge Bases

## Goal

Use ThinkBrain's hidden history outside the synced folder to retain the common
ancestor for OneDrive/Syncthing conflicts and enable safe three-way text merges.

## Acceptance Criteria

- Retain a per-file pre-divergence baseline before local or incoming edits
  overwrite it; associate its stable identity with the competing versions.
- Select the recorded common ancestor, not simply the latest local snapshot.
  Unknown or ambiguous ancestry leaves both versions available for manual review.
- Baselines survive restart and remain protected from pruning/undo clearing
  while needed; a resolution checkpoint is not itself the earlier merge base.
- Merge non-overlapping text edits; ask about overlapping edits and deletions.
  Binary files retain whole-file choices. Preserve both sides before resolution
  and reject stale writes.
- Test two devices starting from a shared baseline, offline edits, conflicts
  arriving after restart, missing/ambiguous bases, and maintenance while unresolved.

## Files

- `apps/desktop/src-tauri/src/commands/sync/{snapshot,history,maintain,settle,resolve}.rs`
- `apps/desktop/src/sync/mergeModel.ts`
