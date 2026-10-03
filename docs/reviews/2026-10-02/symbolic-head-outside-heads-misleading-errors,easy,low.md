# Symbolic HEAD pointing outside refs/heads/ produces misleading errors downstream

- **Difficulty:** easy
- **Urgency:** low
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/history_source.rs`
- **Lines:** 232-241, 272-274

## Description

`checkout_branch` returns `head.referent_name()` verbatim without checking it is under `refs/heads/`. A repo whose HEAD is a symbolic ref to `refs/tags/v1` or `refs/remotes/origin/main` (legal via `git symbolic-ref HEAD`) is not detached, so `is_detached()` is false and the non-branch ref is returned as the "checkout branch". `require_checkout` then reports `sync.branch_changed` (wrong — the user isn't "on a different branch"), and `remote_branch_for`'s `strip_prefix("refs/heads/")` failure is wrapped in `unreadable`, producing "Could not read this workspace's saved history source" — which misdirects the user entirely.

## Recommendation

In `checkout_branch`, validate the referent with `validate_branch` (or a `refs/heads/` prefix check) and return `sync.branch_detached` or a dedicated error when HEAD names something outside `refs/heads/`, so a non-branch symbolic HEAD is treated like the "not on a branch" case it semantically is.

## Verification

`is_detached()` only covers oid-detached HEADs (line 232); `referent_name()` returns any symbolic target. The error path at lines 272-274 wraps the failure in `unreadable` (confirmed by reading `unreadable` at lines 49-55).
