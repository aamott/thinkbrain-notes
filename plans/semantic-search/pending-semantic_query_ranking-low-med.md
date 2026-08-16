# Semantic Similarity Query and Ranking

## Goal

Given a user query, embed it and return the most semantically similar notes
from the vector cache, ranked by similarity score. This is the semantic-only
query path that hybrid search builds on.

## Acceptance Criteria

- [ ] A query string is embedded with the active provider and compared against
      stored note embeddings.
- [ ] Results are ranked by cosine similarity (or equivalent), best match first.
- [ ] Result shape includes path, fileName, title, snippet, and score so it can
      merge with existing `SearchResult`.
- [ ] Semantic query runs without blocking the editor (async, abortable).
- [ ] Empty or degenerate queries return no results rather than erroring.
- [ ] Failures fail loudly with typed errors.

## References

- `plans/wip-indexing-search-med-med.md` — indexing-search epic and FTS5 query foundation
- `apps/desktop/src-tauri/src/commands/search.rs` — shipped native search backend and `SearchHit`
- A future typed frontend bridge remains planned for native search commands; no bridge file is assigned yet.
- `plans/pending-semantic-search-low-hard.md` — Scope (semantic similarity query and ranking)
