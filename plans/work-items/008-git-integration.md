# Work Item 008: Git Integration

## Status

Planned

## Goal

Implement basic system Git integration for the active workspace.

## Required Reading

- `plans/004-technical-decisions.md`
- `plans/005-mvp-scope.md`
- `plans/architecture/git.md`
- `plans/architecture/workspace.md`
- `plans/architecture/ui-shell.md`

## Scope

Implement:

- system Git availability check
- repository detection
- repository initialization
- status
- stage/unstage
- commit
- branch list/current branch
- source-control sidebar panel
- useful errors for common Git failures

## Non-Goals

Do not implement embedded Git, provider integrations, advanced conflict editor, sync, or full push/pull UX polish unless explicitly reassigned.

## Dependencies

- `001-project-scaffold.md`
- `002-desktop-tauri-shell.md`
- `003-workspace-and-file-explorer.md`

## Owns

- Git core types/services
- Tauri/Rust Git commands
- source-control UI
- Git tests

## Acceptance Criteria

- [ ] App detects whether current workspace is a Git repo.
- [ ] User can initialize a repo.
- [ ] User can view status.
- [ ] User can stage/unstage files.
- [ ] User can commit staged files.
- [ ] Missing Git produces a clear error.

## Validation

Run Git unit/integration tests against a temporary repository, plus lint/typecheck/build and `cargo test` if native Git code exists.
