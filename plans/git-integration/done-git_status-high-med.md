# Git Status

## Goal

Get the status of changed, staged, and untracked files in the active workspace
repo so the source-control panel can list them.

## Acceptance Criteria

- [x] Native command runs `git status` (NUL-delimited porcelain v1) at the workspace root
      and returns a typed list of file entries with status codes.
- [x] Frontend service exposes `getStatus(rootPath)` returning a typed
      result (staged, changed, untracked groupings).
- [x] Status is refreshed when the panel opens and can be refreshed explicitly;
      future stage/unstage/commit operations invalidate the same cache.
- [x] Porcelain output is parsed in a typed, testable way (no `any`).
- [x] Rust unit test parses status output from a temp repo with staged,
      modified, and untracked files.
- [x] Vitest unit tests cover the frontend parsing/mapping helper.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs` — new command + registration
- `apps/desktop/src/native/commands.ts` — `NativeCommandMap` entry + types
- `apps/desktop/src/git/gitService.ts` — frontend helper + parsing
- `apps/desktop/src/git/gitService.test.ts` — parsing tests
- `apps/desktop/src/git/SourceControlPanel.tsx` — fresh local panel state;
  do not restore the retired desktop store or UI.

## Notes

Depends on `repo_detection` (status only meaningful inside a repo).

## Implementation

The native layer runs fixed `git status --porcelain=v1 -z --untracked-files=all`
and parses paths/status codes into a typed result, including rename/copy
records. The fresh Git service caches status per workspace and the Source
Control panel groups staged, changed, and untracked entries with a safe Refresh
action.
