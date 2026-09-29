# Migrate Synthetic Snapshot Workspaces

Depends on: `pending-graph_version_history-high-hard.md`

## Goal

Make established history visible in workspaces that already contain
ThinkBrain's synthetic first snapshot.

## Acceptance Criteria

- Migration detects a synthetic first snapshot and imported history without
  relying only on user-visible English copy.
- Existing ThinkBrain commits and checkpoints remain valid and restorable.
- Imported history becomes visible without rewriting user-owned refs or pushing
  migration-only commits.
- Running migration repeatedly is idempotent.
- A partially completed migration either resumes safely or rolls back its
  private refs without losing existing history.
- Tests cover an unrelated first snapshot merged with a remote history, a
  matching snapshot, an already-migrated workspace, and no imported history.

## Files

- `apps/desktop/src-tauri/src/commands/sync/bootstrap.rs`
- `apps/desktop/src-tauri/src/commands/sync/history.rs`
- `apps/desktop/src-tauri/src/commands/sync/registry.rs`
