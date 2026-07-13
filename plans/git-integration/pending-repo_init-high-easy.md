# Repository Initialization

## Goal

Let the user initialize a new Git repository in the active workspace root from
the source-control panel when the workspace is not yet a repo.

## Acceptance Criteria

- [ ] Native command runs `git init` at the workspace root.
- [ ] Frontend service exposes `initRepository(rootPath)`.
- [ ] UI shows an "Initialize repository" action only when the workspace is not
      a repo and Git is available.
- [ ] After init, repo detection re-runs and the panel switches to status view.
- [ ] Failure (e.g. permission error) surfaces a typed `NativeError`.
- [ ] Rust unit test runs `git init` in a temp dir and asserts a `.git` dir is
      created.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs` — new command + registration
- `apps/desktop/src/native/commands.ts` — `NativeCommandMap` entry + types
- `apps/desktop/src/git/gitService.ts` — frontend helper
- `apps/desktop/src/git/SourceControlPanel.tsx` — init button (new)

## Notes

Depends on `repo_detection` (to know when init is offered).
