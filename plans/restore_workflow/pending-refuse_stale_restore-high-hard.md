# Refuse A Stale Restore

Depends on: `record_restore_provenance`

## Goal

Prevent a restore preview from overwriting content that changed after the
preview was opened.

## Acceptance Criteria

- Reading a restore preview returns a fingerprint of the exact current bytes
  shown to the user.
- Restore requires that fingerprint and checks it under the workspace mutation
  lock immediately before checkpointing and writing.
- A mismatch writes nothing, records nothing, keeps the preview open, and
  offers to refresh the comparison.
- An open dirty editor is saved first; the preview is refreshed or refused
  rather than silently comparing against one state and overwriting another.
- Binary and text restores use the same current-byte guard.
- Tests cover external writes, another app window, dirty-save movement,
  unchanged content, and a file deleted after preview.

## Files

- `apps/desktop/src-tauri/src/commands/sync/history.rs`
- `apps/desktop/src/sync/historyTypes.ts`
- `apps/desktop/src/sync/syncService.ts`
- `apps/desktop/src/shell/useShellState.ts`
