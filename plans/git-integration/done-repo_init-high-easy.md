# Repository Initialization

## Goal

Let the user initialize a new Git repository in the active workspace root from
the source-control panel when the workspace is not yet a repo.

## Acceptance Criteria

- [x] Native command runs `git init --quiet` at the workspace root.
- [x] Frontend service exposes `initializeRepository(rootPath)`.
- [x] UI shows an "Initialize repository" action only when the workspace is not
      a repo and Git is available.
- [x] After init, repository detection re-runs and the panel switches to status view.
- [x] Failure (e.g. permission error) surfaces a typed `NativeError`.
- [x] Rust unit test runs `git init` in a temp dir and asserts a `.git` dir is
      created.

## Relevant Files

- `apps/desktop/src-tauri/src/commands/git.rs` — repository-initialization
  command implementation
- `apps/desktop/src-tauri/src/commands/mod.rs` — export and
  `app_command_handlers!` registration
- `apps/desktop/src-tauri/src/lib.rs` — builder entry only; not a per-command
  registration list
- `apps/desktop/src/native/commands.ts` — `NativeCommandMap` entry + types
- `apps/desktop/src/git/gitService.ts` — frontend helper
- `apps/desktop/src/git/SourceControlPanel.tsx` — init button (new)

## Notes

Depends on `repo_detection` (to know when init is offered).

Build against the current fresh `apps/desktop/src/git/` service and Source
Control panel. Do not restore the retired desktop UI, CSS, or store.

## Implementation

The native initializer first detects an existing repository, runs fixed
non-interactive `git init --quiet` only when needed, then re-detects and
returns authoritative repository state. The frontend invalidates cached
detection before and after initialization, and the fresh panel shows progress,
safe errors with retry, and success only after a repository result.
