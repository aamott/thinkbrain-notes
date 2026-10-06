# Detached-checkout pause is invisible to the user

- **Difficulty:** trivial
- **Urgency:** low
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/bootstrap.rs`
- **Lines:** 118-124

## Description

When the vault's `.git` is detached, the import is skipped with only `eprintln!`. The history panel will simply show no imported history with no indication why, and `ManagedWorkspace` carries no flag for "import paused — detached HEAD" the way `has_own_git` communicates repo presence. The comment acknowledges the pause is intentional, but nothing surfaces it to a window — contrary to the "explain checkout/link mismatch" guardrail.

## Recommendation

Consider adding a field to `ManagedWorkspace` (e.g. `git_import_paused`) or emitting a status the history UI/`alongside_own_git` path can report.

## Verification

`own_git_detached` → `eprintln!` only; `ManagedWorkspace` fields are `repo`, `took_first_snapshot`, `has_own_git` (bootstrap.rs:28-45). No state reaches the engine/UI.
