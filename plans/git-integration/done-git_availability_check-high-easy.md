# Git Availability Check

## Goal

Detect whether a system `git` binary is installed and available on PATH so the
app can gate all other Git features and show a clear message when Git is
missing.

## Acceptance Criteria

- [x] Native command `git_availability` returns whether `git` is
      installed and its version string.
- [x] Frontend service exposes a typed `checkAvailability()` helper.
- [x] When Git is missing, the fresh Source Control panel shows a clear "Git not
      installed" message and disables Git actions.
- [x] Result is cached for the session (no re-check on every action).
- [x] Rust unit tests cover the installed / not-installed paths.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs` — add `#[tauri::command]` + register in
  `tauri::generate_handler![]`
- `apps/desktop/src/native/commands.ts` — add to `NativeCommandMap`, add typed
  result interface
- `apps/desktop/src/git/gitService.ts` — fresh frontend service and
  session-scoped cache
- A future fresh source-control panel owns display state; do not restore the
  retired desktop store or UI.

## Implementation

The native command runs fixed, non-interactive `git --version` with a bounded
timeout. Missing Git is a normal `{ available: false }` result; unexpected
process failures use typed native errors. The injected Git service caches the
result for the app session and the fresh Source Control panel renders a
user-safe missing-Git state.
