# Stage / Unstage Files

## Goal

Let the user stage and unstage individual files (and optionally all changes)
from the source-control panel.

## Acceptance Criteria

- [ ] Native commands run `git add <path>` and `git reset <path>` (or
      `git restore --staged`) at the workspace root, scoped to the workspace.
- [ ] Frontend service exposes `stageFiles(rootPath, paths)` and
      `unstageFiles(rootPath, paths)`.
- [ ] UI provides per-file stage/unstage actions and a "stage all" action.
- [ ] After stage/unstage, status is refreshed.
- [ ] Paths are validated to stay within the workspace root (no path escape).
- [ ] Rust unit tests cover staging and unstaging in a temp repo.
- [ ] Failures surface typed `NativeError`s.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs` — new commands + registration
- `apps/desktop/src/native/commands.ts` — `NativeCommandMap` entries + types
- `apps/desktop/src/git/gitService.ts` — frontend helpers
- `apps/desktop/src/git/SourceControlPanel.tsx` — per-file actions

## Notes

Depends on `git_status` (panel needs the file list to act on).
