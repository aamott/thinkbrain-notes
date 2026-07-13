# Commit

## Goal

Let the user commit staged files with a commit message from the source-control
panel.

## Acceptance Criteria

- [ ] Native command runs `git commit -m <message>` at the workspace root.
- [ ] Frontend service exposes `commit(rootPath, message)`.
- [ ] UI provides a commit-message input and a commit button.
- [ ] Commit button is disabled when there is nothing staged or the message is
      empty.
- [ ] After a successful commit, status and branch info refresh.
- [ ] Empty commit / hook failure surfaces a typed `NativeError` with the Git
      stderr in `details`.
- [ ] Rust unit test commits in a temp repo and asserts a commit is created.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs` — new command + registration
- `apps/desktop/src/native/commands.ts` — `NativeCommandMap` entry + types
- `apps/desktop/src/git/gitService.ts` — frontend helper
- `apps/desktop/src/git/SourceControlPanel.tsx` — message input + commit button

## Notes

Depends on `stage_unstage` (need staged files to commit) and `git_status`
(to know when something is staged).
