# `resolve()`'s populated-remote `branch_missing` path is never exercised

- **Difficulty:** easy
- **Urgency:** low
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/round_branch_tests.rs`
- **Lines:** 161-177

## Description

`a_deleted_remote_branch_is_an_error_not_a_recreate` deletes the remote's *only* branch, so the remote advertises nothing — `resolve` (network.rs:288-291) takes the unborn/empty arm and returns `tip: None`, and the `sync.branch_missing` error actually comes from `round.rs:274-282` via `previous_source_tip`. The distinct code path where the remote is *populated* (other branches exist) but the *bound* branch is missing — `resolve` returning `branch_missing` at network.rs:282-285 — is untested. A regression that silently returned `tip: None` for a populated remote would produce the same error by accident, masking it.

## Recommendation

Add a variant where the remote keeps a second branch (e.g. `other`) while the bound `main` is deleted, so `resolve`'s populated arm is what fires.

## Verification

`commit_into(&remote, ...)` at round_branch_tests.rs:164 creates only `refs/heads/main`; `fs::remove_file(remote_path.join("refs/heads/main"))` at :173 leaves zero advertised refs, confirmed by the `populated = !advertised.born.is_empty()` check at network.rs:274.
