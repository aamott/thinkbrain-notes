# Work Items

This folder contains implementation tasks designed for parent-agent delegation.

## How to Use

A parent agent should:

1. Read `plans/000-agent-entrypoint.md`.
2. Read all required core docs.
3. Select one work item for each sub-agent.
4. Give the sub-agent only the docs needed for that work item plus the global rules.
5. Review the result before assigning dependent work.

## Recommended Sequence

1. `001-project-scaffold.md`
2. `002-desktop-tauri-shell.md`
3. `003-workspace-and-file-explorer.md`
4. `004-note-model-and-markdown-parser.md`
5. `005-editor.md`
6. `006-indexer-and-search.md`
7. `007-settings.md`
8. `008-git-integration.md`
9. `009-theme-foundation.md`
10. `010-test-ci-and-quality.md`

## Parallelization Guidance

After the scaffold exists, some work can happen in parallel if edit scopes are respected:

- note model/parser can proceed independently of UI shell
- settings can proceed independently of editor
- Git can proceed independently after native command patterns exist
- tests/CI can proceed once the scaffold and command names are stable

Avoid parallel work that edits the same package or shared interface without an agreed contract.

## Work Item Rules

Each sub-agent must:

- stay inside the assigned scope
- respect non-goals
- preserve Markdown-first/local-first principles
- add or update tests when practical
- run relevant validation
- report unresolved decisions instead of inventing architecture
