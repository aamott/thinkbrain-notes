# Work Item 002: Desktop Tauri Shell

## Status

Planned

## Goal

Create the desktop shell and native-command boundary used by later workspace, filesystem, Git, and search work.

## Required Reading

- `plans/004-technical-decisions.md`
- `plans/005-mvp-scope.md`
- `plans/architecture/app-architecture.md`
- `plans/architecture/ui-shell.md`

## Scope

Implement:

- Tauri app configuration
- React app bootstrapping inside desktop shell
- typed command invocation pattern
- native error shape/conventions
- minimal status/error display for native failures

## Non-Goals

Do not implement workspace browsing, editor, Git, search, AI, sync, or marketplace features.

## Dependencies

- `001-project-scaffold.md`

## Owns

- `apps/desktop/src-tauri/**`
- `apps/desktop/src/**` only for shell/bootstrap code
- shared native-command types if needed

## Acceptance Criteria

- [ ] Desktop app boots.
- [ ] Frontend can call a trivial native command.
- [ ] Native errors are represented consistently.
- [ ] Future native commands have a clear pattern to follow.

## Validation

Run relevant desktop build/test commands and `cargo test` if Rust code exists.
