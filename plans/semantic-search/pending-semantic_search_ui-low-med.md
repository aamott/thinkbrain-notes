# Semantic Search UI

## Goal

Surface semantic/hybrid search in the existing search panel. Add a toggle or
mode so users can enable semantic search and see meaning-based results blended
with keyword hits.

## Acceptance Criteria

- [ ] A control in the search panel toggles semantic search on/off.
- [ ] With semantic search on, results come from the hybrid search path.
- [ ] With semantic search off, results come from the existing FTS5 path
      (current default behaviour unchanged).
- [ ] Indexing/embedding progress is reported reusing the existing indexing
      status UI pattern.
- [ ] No inline styles; CSS Modules co-located with the panel.
- [ ] Disabled gracefully when no workspace is open or embeddings are
      unavailable.

## References

- `apps/desktop/src/search/SearchPanel.tsx` — search panel to extend
- `apps/desktop/src/stores/appStore.ts` — `SearchState`, `IndexingState` slices
- `apps/desktop/src/search/useWorkspaceIndexer.ts` — indexing progress pattern
- `plans/pending-semantic-search-low-hard.md` — Scope (semantic search UI)
