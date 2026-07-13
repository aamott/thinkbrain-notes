# Branch List + Current Branch

## Goal

List local branches and show the current branch in the source-control panel
header.

## Acceptance Criteria

- [ ] Native command runs `git branch` (or `git for-each-ref`) at the workspace
      root and returns the branch list plus the current branch name.
- [ ] Frontend service exposes `getBranches(rootPath)` returning a typed result
      (`current: string | null`, `branches: readonly string[]`).
- [ ] Current branch is shown in the panel header.
- [ ] Handles the no-commits-yet case (no branches) gracefully.
- [ ] Rust unit test covers a temp repo with multiple branches and the
      fresh-init (no commits) case.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs` — new command + registration
- `apps/desktop/src/native/commands.ts` — `NativeCommandMap` entry + types
- `apps/desktop/src/git/gitService.ts` — frontend helper
- `apps/desktop/src/git/SourceControlPanel.tsx` — branch display

## Notes

Depends on `repo_detection`. Branch switching/creation is out of scope for this
epic (list + current only).
