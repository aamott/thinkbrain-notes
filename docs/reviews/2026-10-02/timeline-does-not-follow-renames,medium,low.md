# Per-note timeline does not follow renames — pre-rename versions are unreachable

- **Difficulty:** medium
- **Urgency:** low
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/history_walk.rs`
- **Lines:** 274-329

## Description

`note_events` walks by exact path only. When a note is renamed in the imported git history, the rename commit appears in the new path's timeline as `Added` (all `parent_blobs` are `None` for the new path), and every version recorded under the old name is permanently invisible to the new note's version list — `restore`/`diff_version` can never reach them. This may be an acceptable simplification for the "one simple file timeline" guardrail, but it means history adoption silently truncates a note's past at its last rename, with no indication to the user.

## Recommendation

If rename-following is out of scope, document it explicitly in the module docs and `docs/superpowers/specs/file-history-design.md` so the truncation is a stated contract; if it should be followed, track rename pairs during `touched`/the walk and continue the per-path query at the old name.

## Verification

Read `note_events` in full — `blob_at`/`blob_at_commit` only ever query the single `note` path; no rename detection exists in `history_walk.rs` or `history_page.rs`. Confirmed no rename handling is specified in the spec or sync-history skill.
