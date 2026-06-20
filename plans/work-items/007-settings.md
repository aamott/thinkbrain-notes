# Work Item 007: Settings

## Status

Done

## Goal

Implement basic JSON-backed application and workspace settings.

## Required Reading

- `plans/004-technical-decisions.md`
- `plans/005-mvp-scope.md`
- `plans/architecture/settings.md`
- `plans/architecture/workspace.md`

## Scope

Implement:

- settings types/schema
- application settings load/save
- workspace settings policy after decision is confirmed
- version field
- validation errors
- migration structure
- basic settings UI if shell exists

## Non-Goals

Do not implement extension settings, settings sync, marketplace settings, or a complex preferences system.

## Dependencies

- `001-project-scaffold.md`
- `002-desktop-tauri-shell.md` preferred for native app-data paths

## Owns

- settings core modules
- settings native commands if needed
- settings UI
- settings tests

## Acceptance Criteria

- [x] Application settings load and save as JSON.
- [x] Invalid settings fail with clear errors or safe defaults.
- [x] Settings include a version field.
- [x] Tests cover load/save and migration behavior.

## Validation

Run settings tests plus lint/typecheck/build.
