# Indexing and Search

## Goal

Provide fast search over local Markdown workspaces while preserving Markdown files as the source of truth.

## Source of Truth

Markdown files on disk are authoritative.

The search index is disposable and must be rebuildable from workspace files.

## MVP Search Scope

MVP search should support:

- filename search
- Markdown body text search
- frontmatter `title`
- frontmatter `tags`
- frontmatter `aliases`
- inline `#tags`, if parser support exists

## Preferred Cache

Preferred implementation: SQLite with FTS5.

The cache must be stored in the OS application-data directory, never inside the workspace.

## Suggested Schema

Initial schema may include:

```text
files(
  path primary key,
  title,
  modified_at,
  content_hash
)

tags(
  tag_name,
  file_path
)

aliases(
  alias,
  file_path
)

links(
  source_path,
  target_text
)

notes_fts virtual table
```

The exact schema may evolve, but it must remain derivable from Markdown files.

## Indexing Process

1. Workspace opens.
2. App lists Markdown files.
3. App starts background indexing.
4. Parser extracts frontmatter, tags, aliases, links, and searchable text.
5. Search cache updates incrementally.
6. UI reports indexing progress when useful.

## File Watching

File watcher should:

- observe workspace changes
- debounce events
- ignore app cache directories
- ignore hidden temporary files where practical
- process `.md` files first
- process whitelisted attachment types only if needed

## Startup Constraint

The editor must remain usable while the initial index is building.

## Deferred

Not in MVP:

- semantic search
- embeddings
- AI-assisted discovery
- graph UI
- advanced query language
