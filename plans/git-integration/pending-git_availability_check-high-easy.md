# Git Availability Check

## Goal

Detect whether a system `git` binary is installed and available on PATH so the
app can gate all other Git features and show a clear message when Git is
missing.

## Acceptance Criteria

- [ ] Native command `git_availability` (or similar) returns whether `git` is
      installed and its version string.
- [ ] Frontend service exposes a typed helper (e.g. `checkGitAvailability()`).
- [ ] When Git is missing, the source-control panel shows a clear "Git not
      installed" message and disables Git actions.
- [ ] Result is cached for the session (no re-check on every action).
- [ ] Rust unit test covers the installed / not-installed paths.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs` — add `#[tauri::command]` + register in
  `tauri::generate_handler![]`
- `apps/desktop/src/native/commands.ts` — add to `NativeCommandMap`, add typed
  result interface
- `apps/desktop/src/git/gitService.ts` — new frontend service (mirror
  `workspaceService.ts` pattern)
- `apps/desktop/src/stores/appStore.ts` — Git availability slice
