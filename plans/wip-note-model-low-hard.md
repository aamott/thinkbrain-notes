# Note Model

Portable Markdown note format: frontmatter metadata, tag/alias/wiki-link
extraction, and the serialization policy that keeps user files as plain
Markdown on disk.

## Scope

- YAML frontmatter parsing and serialization in `packages/core`.
- Note metadata types and normalization (title, tags, aliases, status,
  timestamps, unknown fields).
- Markdown body extraction: inline tags, wiki links, task checkboxes.
- Mutation policy: opening, indexing, or searching a note must never rewrite
  the file. Timestamps are managed only on explicit create/save.

## Architecture Decisions

- **Source of truth is the file on disk.** No database, proprietary format, or
  sidecar file. The SQLite index is an ephemeral cache, always rebuildable.
- **Unknown frontmatter fields are preserved by value** when the app
  serializes a note. Original YAML formatting and comments are not preserved
  (see OI-001 below).
- **Timestamps use `created_at` / `updated_at`** only. Do not also use
  `created` / `updated`.
- **Tasks are Markdown checkboxes** (`- [ ]` / `- [x]`). No proprietary task
  database in MVP.
- **Wiki links** use Obsidian-compatible `[[Target]]` / `[[Target|Text]]`
  syntax. Parsed for indexing; graph UI is deferred.

## Status

- ✅ Note metadata types and normalization — `packages/core/src/note-model.ts`
- ✅ Frontmatter parser (YAML, malformed-input fallback, diagnostics) — `packages/core/src/frontmatter.ts`
- ✅ Frontmatter serializer preserving unknown fields by value — `packages/core/src/frontmatter.ts`
- ✅ Tag, alias, wiki-link, and task extraction — `packages/core/src/markdown.ts`
- ✅ Parser tests including malformed frontmatter — `packages/core/src/note-parser.test.ts`
- ⬜ Comment-preserving frontmatter round-trips (OI-001) — low urgency, hard
