# Read Versions Across Git History

Depends on: `pending-ingest_git_history-high-hard.md`

## Goal

Show every relevant historical version of a file across imported and
ThinkBrain-recorded commit graphs.

## Acceptance Criteria

- History traversal visits all reachable parents rather than only the first
  parent of merge commits.
- Per-file entries preserve the source commit's timestamp and message.
- Commits that produce identical contents for the requested path collapse to
  one displayed version without losing the newest relevant provenance.
- Results are deterministic, newest first, across merges and multiple imported
  roots.
- Pagination or a continuation cursor replaces the current silent 5,000-commit
  horizon; reaching a bound is visible to the caller.
- Restore and comparison handles continue to resolve after pagination and app
  restart.
- Tests cover second-parent history, criss-crossing merge graphs, duplicate
  blobs, missing paths, deletions, and histories longer than one page.

## Files

- `apps/desktop/src-tauri/src/commands/sync/history.rs`
- `apps/desktop/src/sync/historyTypes.ts`
- `apps/desktop/src/sync/syncService.ts`
