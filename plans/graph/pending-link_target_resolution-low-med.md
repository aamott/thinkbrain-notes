# Link Target Resolution

## Goal

Provide a shared, platform-agnostic resolver that maps a wiki-link `target`
string to a concrete note in the vault. Wiki links use Obsidian-compatible
`[[Target]]` / `[[Target|Text]]` syntax; `target` may be a note title, an
alias, or a relative path. Backlinks and the graph view both depend on this
resolution to build correct edges.

This is the foundation story for the epic — do it before backlinks or graph
view.

## Acceptance Criteria

- [ ] Resolver lives in `packages/core` with no React/DOM/Node dependency.
- [ ] Resolves a `target` to a note by (in priority order): exact filename
      match, frontmatter `title` match, frontmatter `aliases` match, and
      relative-path match.
- [ ] Normalizes targets case-insensitively and ignores `.md` extension
      differences (matches the indexer's existing behavior).
- [ ] Returns a stable note identifier (e.g. vault-relative path) or `null`
      when no match exists; unresolved links are tracked but never throw.
- [ ] Handles ambiguous targets (multiple notes match) deterministically and
      documents the tie-break rule.
- [ ] Tests cover: title match, alias match, path match, unresolved target,
      ambiguous target, case/extension normalization.

## References

- `packages/core/src/note-model.ts` — `WikiLink` (`target`, `displayText?`),
  `NoteMetadata` (`title`, `aliases`)
- `packages/core/src/markdown.ts` — `extractWikiLinks`
- `plans/note-model.md` — wiki-link syntax and parsing
- `plans/graph.md` — this epic
