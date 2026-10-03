# Read Current-Branch File History

Depends on: `ingest_git_history`

## Goal

Read a note's recorded versions and selected Git ancestry without a migration
step or source-control interface.
Architecture: `docs/superpowers/specs/file-history-design.md`.

## Acceptance Criteria

- Existing clones select the checked-out branch; app imports select the remote
  default. Persist that choice for fetch and push; block those operations on
  checkout/link mismatch or a missing selected branch, never falling back.
  Retained history remains readable while sync needs attention.
- Default history reads ThinkBrain records plus the selected imported root,
  not every retained/archive ref. A vanished source does not hide imported versions.
- Visit every reachable parent once, including merge ancestry; return stable,
  newest-first versions with original timestamps/messages. Collapse redundant
  contents without hiding genuine reverts or deletion/recreation.
- First linking of local records remains supported; replacing a link must not
  automatically join unrelated external histories.
- Existing synthetic snapshots, commits, and checkpoints remain readable and
  restorable without rewriting history or parsing English commit messages.
- Simple pagination replaces the silent 5,000-commit horizon; continuation and
  failures are explicit, and restore handles survive restart.
- Test non-default clone branches, checkout/link mismatch, merge graphs,
  duplicate blobs, missing/deleted paths, existing snapshots, and multiple pages.

## Files

- `apps/desktop/src-tauri/src/commands/sync/history.rs`
- `apps/desktop/src-tauri/src/commands/sync/history_{source,walk,page}.rs`
- `apps/desktop/src-tauri/src/commands/sync/history_ingest.rs`
- `apps/desktop/src-tauri/src/commands/sync/network.rs`
- `apps/desktop/src-tauri/src/commands/sync/push.rs`
- `apps/desktop/src-tauri/src/commands/sync/round.rs`
- `apps/desktop/src/sync/historyTypes.ts`
- `apps/desktop/src/sync/syncService.ts`
