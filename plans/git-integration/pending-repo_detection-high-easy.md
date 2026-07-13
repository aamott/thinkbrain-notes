# Repository Detection

## Goal

Detect whether the active workspace root is inside a Git repository so the UI
can switch between "not a repo" (offer init) and "repo" (show status/staging).

## Acceptance Criteria

- [ ] Native command checks for a `.git` dir (or `git rev-parse --is-inside-work-tree`)
      at the workspace root.
- [ ] Frontend service exposes `detectRepository(rootPath)` returning a typed
      result (`isRepo: boolean`, current branch if available).
- [ ] Detection runs when a workspace becomes ready and when the panel is
      opened.
- [ ] Rust unit test against a temp repo and a non-repo folder.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs` — new command + registration
- `apps/desktop/src/native/commands.ts` — `NativeCommandMap` entry + types
- `apps/desktop/src/git/gitService.ts` — frontend helper
- `apps/desktop/src/stores/appStore.ts` — repo-detection state slice
- `apps/desktop/src/workspace/workspaceService.ts` — reference for service
  pattern

## Notes

Depends on `git_availability_check` (Git must be present before detecting a
repo).
