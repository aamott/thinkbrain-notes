# Every history page recomputes the full event stream

- **Difficulty:** medium
- **Urgency:** low
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/history_page.rs`
- **Lines:** 194-218

## Description

`page()` calls `events()`, which runs `history_walk::gather` over *every* commit reachable from main + imported source + checkpoints, then `note_events`/`ledger_events` over all of them, only to `.skip(offset).take(limit)`. For an imported repository with tens of thousands of commits, each page turn is O(entire history) with a tree lookup per commit. The cursor's design goal — replaying a stable stream — is achieved, but pagination saves no work; it's a full walk per page on a user-visible command.

## Recommendation

Consider memoizing the gathered `Node` list per (roots, note) or walking lazily until `offset + limit` events are produced; at minimum, confirm acceptable latency on a large real-world import.

## Verification

Read `page()` (lines 173-223) → `events()` (135-145) → `gather()` in history_walk.rs (148-181): full reachable-graph decode on every call, no bound.
