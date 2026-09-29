# Record Restore Provenance

## Goal

Record a successful restore immediately and identify what historical version
produced it.

## Acceptance Criteria

- Native restore checkpoints the current bytes, writes the selected bytes, and
  records the resulting state on the main history branch before returning.
- The record carries a typed restore kind, source change id, source timestamp,
  and restored path without depending on English message parsing.
- The watcher observing the same write creates no duplicate generic commit.
- Recording is serialized with ordinary history recording and cannot race a
  save or sync merge.
- A failed write or failed history record never reports a successful restore;
  recovery preserves both the original checkpoint and an actionable error.
- Existing restore handles and checkpoints remain valid after restart.

## Files

- `apps/desktop/src-tauri/src/commands/sync/history.rs`
- `apps/desktop/src-tauri/src/commands/sync/snapshot.rs`
- `apps/desktop/src-tauri/src/commands/sync/engine.rs`
- `apps/desktop/src/sync/historyTypes.ts`
