# Work Item 004: Note Model and Markdown Parser

## Status

Planned

## Goal

Define and test the core note model, frontmatter parser, and Markdown metadata extraction used by editor, search, and future graph/backlinks features.

## Required Reading

- `plans/004-technical-decisions.md`
- `plans/005-mvp-scope.md`
- `plans/architecture/notes.md`
- `plans/architecture/indexing-search.md`

## Scope

Implement:

- note metadata types
- frontmatter parser
- frontmatter serializer/preservation strategy if needed
- tag extraction
- alias extraction
- wiki-link extraction
- Markdown task checkbox parsing if straightforward
- parser tests, including malformed frontmatter

## Non-Goals

Do not implement editor UI, graph UI, search database, AI, or automatic note rewriting.

## Dependencies

- `001-project-scaffold.md`

## Owns

- `packages/core` note/Markdown parsing modules
- related tests

## Acceptance Criteria

- [ ] Parser extracts title, tags, aliases, status, timestamps, wiki links, and tasks where supported.
- [ ] Parser preserves unknown frontmatter fields conceptually or via tests if serialization exists.
- [ ] Opening/parsing a note does not imply rewriting it.
- [ ] Malformed input returns useful errors or safe fallback results.

## Validation

Run parser-specific tests, then lint/typecheck/test when practical.
