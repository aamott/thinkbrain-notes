# Repository Detection

## Goal

Detect whether the active workspace root is inside a Git repository so the UI
can switch between "not a repo" (offer init) and "repo" (show status/staging).

## Acceptance Criteria

- [x] Native command checks with `git rev-parse --is-inside-work-tree`
      at the workspace root.
- [x] Frontend service exposes `detectRepository(rootPath)` returning a typed
      result (`isRepo: boolean`, current branch if available).
- [x] Detection runs when a workspace becomes ready and when the panel is
      opened.
- [x] Rust tests cover a temp repo and a non-repo folder when system Git is
      available, with injected-runner coverage independent of host Git.

## Relevant Files

- `apps/desktop/src-tauri/src/commands/git.rs` — repository-detection command
  implementation
- `apps/desktop/src-tauri/src/commands/mod.rs` — export and
  `app_command_handlers!` registration
- `apps/desktop/src-tauri/src/lib.rs` — builder entry only; not a per-command
  registration list
- `apps/desktop/src/native/commands.ts` — `NativeCommandMap` entry + types
- `apps/desktop/src/git/gitService.ts` — fresh frontend helper
- A future fresh source-control panel owns repository-display state; do not
  restore the retired desktop store or UI.

## Implementation

The native layer canonicalizes the workspace root, checks repository state with
fixed non-shell Git commands, and reports the current symbolic branch when one
exists. Detection is pre-warmed on workspace open, cached per root by the typed
Git service, and rendered in the fresh Source Control panel.

## Notes

Depends on `git_availability_check` (Git must be present before detecting a
repo).
