# Hybrid Search

## Goal

Merge FTS5 keyword hits with semantic similarity hits into a single ranked
result list. Exact keyword matches should not be buried by semantic noise; the
hybrid rank balances exact-match strength with meaning similarity.

## Acceptance Criteria

- [ ] A hybrid search call returns a single merged, ranked result list.
- [ ] Exact keyword matches (FTS5) are weighted so they are not buried by
      lower-similarity semantic hits.
- [ ] Notes appearing in both result sets are deduplicated, not shown twice.
- [ ] Result shape matches the existing `SearchResult` so the UI needs minimal
      changes.
- [ ] When semantic search is disabled or the vector cache is empty, hybrid
      search falls back to FTS5-only results.
- [ ] Tests cover: keyword-only overlap, semantic-only overlap, both, and
      fallback when embeddings are unavailable.

## References

- `apps/desktop/src/search/searchService.ts` — `searchWorkspace`, `SearchResult`
- `apps/desktop/src-tauri/src/lib.rs` — `documents_fts` FTS5 query path
- `plans/semantic-search.md` — Architecture Decisions (hybrid ranking)
