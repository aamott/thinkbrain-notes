# Save A Selective Restore

Depends on: `selective_change_controls`
Depends on: `restore_workflow/record_restore_provenance`

## Goal

Safely replace the file with the complete customized result.

## Acceptance Criteria

- The native command accepts the complete result, source version id, and
  expected-current fingerprint; it never accepts renderer-generated patches.
- Under one mutation lock it verifies current bytes, checkpoints them, writes
  atomically, and records typed selective-restore provenance.
- Success clears the draft, closes the restore tab, focuses the file, reloads
  it, and emits the same confirmation contract as full restore.
- Failure preserves the draft and reports an actionable error.
- Binary files do not offer customized text restore.
- Tests cover manual-only edits, one selected change, multiple changes, empty
  files, stale current bytes, write failure, record failure, and restore/Undo.

## Files

- `apps/desktop/src-tauri/src/commands/sync/history.rs`
- `apps/desktop/src/native/commands.ts`
- `apps/desktop/src/sync/syncService.ts`
- `apps/desktop/src/shell/useShellState.ts`
