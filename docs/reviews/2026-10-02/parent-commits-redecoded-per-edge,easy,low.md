# Parent commits are re-decoded once per child edge in `note_events`

- **Difficulty:** easy
- **Urgency:** low
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/history_walk.rs`
- **Lines:** 254-261, 283-286

## Description

`blob_at_commit` calls `snapshot::tree_of(repo, Some(commit))` which re-runs `commit_tree` — a full object lookup + decode — for every parent of every node, even though `nodes` already holds each parent's `tree: gix::ObjectId` decoded in `gather`. On large imported histories this is O(E) redundant object decodes per page read, on top of the already O(commits) `blob_at` peels.

## Recommendation

Build a `HashMap<id, tree>` from `nodes` (or pass one in) and resolve parent trees from it, falling back to `tree_of` only for ids not in the slice.

## Verification

`Node.tree` is populated in `decode` (line 113) for every gathered commit; `blob_at_commit` ignores it and re-reads the commit object via `commit_tree` inside `snapshot::tree_of` (snapshot.rs:300-308).
