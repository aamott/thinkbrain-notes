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
- [ ] Disabled gracefully when no workspace is open or embeddings are
      unavailable.

## References

- `apps/desktop/src/search/SearchPanel.tsx` — search panel to extend
- `apps/desktop/src/search/searchPanelModel.ts` — current placeholder search state model
- `plans/indexing-search/` — indexing-search epic and remaining frontend wiring
- `apps/desktop/src/native/commands.ts` + `apps/desktop/src/search/searchService.ts` — existing typed bridge and indexing service to extend.
- `plans/semantic-search/` — Scope (semantic search UI)
