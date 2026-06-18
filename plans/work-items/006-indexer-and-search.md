# Work Item 006: Indexer and Search

## Status

Planned

## Goal

Build the background indexing and search foundation for Markdown workspaces.

## Required Reading

- `plans/004-technical-decisions.md`
- `plans/005-mvp-scope.md`
- `plans/architecture/indexing-search.md`
- `plans/architecture/notes.md`
- `plans/architecture/workspace.md`

## Scope

Implement:

- indexer service
- workspace file scanning
- background indexing flow
- filename and Markdown text search
- tag and alias search if parser support exists
- disposable cache, preferably SQLite FTS5 if feasible
- search UI panel

## Non-Goals

Do not implement semantic search, embeddings, AI discovery, graph UI, sync conflict handling, or app caches inside the workspace.

## Dependencies

- `001-project-scaffold.md`
- `003-workspace-and-file-explorer.md`
- `004-note-model-and-markdown-parser.md`

## Owns

- search/indexing core modules
- search UI
- SQLite/native indexing commands if used
- search tests

## Acceptance Criteria

- [ ] Search finds notes by filename.
- [ ] Search finds notes by Markdown body text.
- [ ] Search finds notes by tags/aliases where parser support exists.
- [ ] Index can be rebuilt from workspace files.
- [ ] Index/cache is not stored in the workspace.
- [ ] Editor remains usable while indexing runs.

## Validation

Run search/index tests plus lint/typecheck/build. Run `cargo test` if native indexing code exists.
