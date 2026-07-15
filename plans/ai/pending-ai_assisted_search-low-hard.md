# AI-Assisted Search and Discovery

## Goal

Lay the foundation for AI-assisted search and discovery: semantic-ish search,
related-note suggestions, and summarization built on the provider abstraction.
This story is the bridge to the `semantic-search` epic and may be split or
deferred when that epic becomes active.

## Acceptance Criteria

- [ ] A core service can request embeddings (when supported by the selected
      provider) behind the provider abstraction.
- [ ] AI-assisted "find related notes" uses workspace context, not just FTS5
      keyword match.
- [ ] Remote embedding calls require explicit user consent.
- [ ] Falls back gracefully when no provider is configured or the provider
      lacks embeddings.
- [ ] Does not break the existing SQLite FTS5 search path.
- [ ] Tests cover the fallback (no provider) path.

## References

- `plans/app-vision.md` — `semantic-search` epic (depends on `indexing-search`,
  possibly `ai`)
- `plans/ai.md` — scope (AI-assisted search and discovery)
- Depends on: provider abstraction. Coordinates with: `semantic-search` epic.
