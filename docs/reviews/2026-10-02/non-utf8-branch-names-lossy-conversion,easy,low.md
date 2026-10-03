# Non-UTF8 branch names pass through lossy conversion into bindings and refspecs

- **Difficulty:** easy
- **Urgency:** low
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/history_source.rs`
- **Lines:** 238-241, 278-280; also `network.rs:327-331`

## Description

`checkout_branch`, `local_head_target`, and `remote_branch_for` convert ref names via `as_bstr().to_string()` / `remote.to_string()` / `merge.to_string()` — lossy conversion that silently mangles refname-legal non-UTF-8 bytes to U+FFFD. Depending on whether the mangled name survives `validate_branch`, a non-UTF8 checkout either errors obscurely or binds a branch that doesn't exist, and every `require_checkout` then compares lossy strings (consistent, but the bound *remote* branch sent to fetch/push may be a ref that doesn't exist — failing with a confusing remote error). No test covers a non-UTF8 branch name.

## Recommendation

Reject non-UTF-8 referent/config names early: convert with `to_str()` (or `String::from_utf8`) and return `sync.branch_unknown`/`unreadable` on failure instead of lossy `to_string()`. Add a fixture creating a ref with a non-UTF8 name (raw loose-ref write) asserting the failure mode is the actionable error.

## Verification

`as_bstr().to_string()` at history_source.rs:241 is `BStr`'s lossy conversion; nothing upstream validates UTF-8 before the name is compared, bound, or sent. Same pattern in `local_head_target` (network.rs:331).
