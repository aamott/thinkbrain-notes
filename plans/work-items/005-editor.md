# Work Item 005: Editor

## Status

Planned

## Goal

Implement the basic Markdown editor experience using CodeMirror 6.

## Required Reading

- `plans/004-technical-decisions.md`
- `plans/005-mvp-scope.md`
- `plans/architecture/editor.md`
- `plans/architecture/notes.md`
- `plans/architecture/workspace.md`

## Scope

Implement:

- CodeMirror 6 Markdown editor
- open active Markdown file
- edit text
- dirty-state tracking
- save through workspace file service
- basic keyboard shortcuts
- syntax highlighting

## Non-Goals

Do not implement AI editing, graph, live preview, Mermaid, math, extension editor plugins, or automatic frontmatter rewrites.

## Dependencies

- `001-project-scaffold.md`
- `003-workspace-and-file-explorer.md`
- `004-note-model-and-markdown-parser.md` preferred

## Owns

- editor UI/components
- editor state hooks/stores
- editor tests where practical

## Acceptance Criteria

- [ ] User can open a Markdown file from the explorer.
- [ ] User can edit content.
- [ ] User can save content to disk.
- [ ] Unsaved changes are tracked.
- [ ] Saved content remains plain Markdown.

## Validation

Run editor tests plus lint/typecheck/build when practical.
