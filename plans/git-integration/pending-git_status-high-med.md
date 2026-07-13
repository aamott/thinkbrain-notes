# Git Status

## Goal

Get the status of changed, staged, and untracked files in the active workspace
repo so the source-control panel can list them.

## Acceptance Criteria

- [ ] Native command runs `git status` (porcelain format) at the workspace root
      and returns a typed list of file entries with status codes.
- [ ] Frontend service exposes `getGitStatus(rootPath)` returning a typed
      result (staged, changed, untracked groupings).
- [ ] Status is refreshed when the panel opens and after stage/unstage/commit.
- [ ] Porcelain output is parsed in a typed, testable way (no `any`).
- [ ] Rust unit test parses status output from a temp repo with staged,
      modified, and untracked files.
- [ ] Vitest unit test covers the frontend parsing/mapping helper.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs` — new command + registration
- `apps/desktop/src/native/commands.ts` — `NativeCommandMap` entry + types
- `apps/desktop/src/git/gitService.ts` — frontend helper + parsing
- `apps/desktop/src/git/gitService.test.ts` — parsing tests
- `apps/desktop/src/stores/appStore.ts` — status state slice

## Notes

Depends on `repo_detection` (status only meaningful inside a repo).
