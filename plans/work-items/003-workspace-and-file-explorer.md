# Work Item 003: Workspace and File Explorer

## Status

Planned

## Goal

Allow users to open a workspace folder and browse/create/manage Markdown files through the desktop UI.

## Required Reading

- `plans/004-technical-decisions.md`
- `plans/005-mvp-scope.md`
- `plans/architecture/workspace.md`
- `plans/architecture/ui-shell.md`

## Scope

Implement:

- open workspace folder flow
- workspace state
- Markdown file listing
- file explorer panel
- create note
- rename note
- delete note with confirmation
- read/write service interfaces for future editor work

## Non-Goals

Do not implement full editor behavior, search indexing, Git UI, sync conflict handling, or app cache storage in the workspace.

## Dependencies

- `001-project-scaffold.md`
- preferably `002-desktop-tauri-shell.md`

## Owns

- workspace/file services
- file explorer UI
- related Tauri filesystem commands

## Interfaces

Expose a file/workspace service suitable for editor and search work:

- open workspace
- list Markdown files
- read file
- write file
- create file
- rename file
- delete file

## Acceptance Criteria

- [ ] User can select/open a workspace folder.
- [ ] Markdown files are shown in the explorer.
- [ ] User can create, rename, and delete Markdown files.
- [ ] File operations fail loudly with clear errors.
- [ ] Workspace opening does not modify user files unnecessarily.

## Validation

Run relevant unit/integration tests plus lint/typecheck/build when practical.
