# Sync Status, History, Restore

## Goal

Finish cross-platform validation of the shipped trust surfaces. Status, local
history, per-note versions, checkpointed restore, and conflict counters already
work without a remote; a workspace's own `.git` does not disable them.

## Acceptance Criteria

- Verify recording failures, recovery actions, conflict counts, and restore /
  restore-of-restore on Windows as well as the existing supported test targets.
- Confirm unsaved-edit behavior is explicit: current restore checkpoints disk
  contents, not an editor buffer. Stale-preview safety belongs to `restore_workflow`.
- Keep conflict counters local and diagnostic; cloud three-way merging is core
  planned behavior in `cloud_merge_base`, not a metric-driven go/no-go.

## Files

- `apps/desktop/src-tauri/src/commands/sync/{status,history}.rs`
- `apps/desktop/src/shell/StatusBar.tsx`
- `apps/desktop/src/sync/HistoryPanel.tsx`
