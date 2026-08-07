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
- `apps/desktop/src/search/searchPanelModel.ts` — current placeholder search state model
- `plans/wip-indexing-search-med-med.md` — indexing-search epic and remaining frontend wiring
- A future typed frontend bridge remains planned for native search/index commands; no indexer hook file is assigned yet.
- `plans/pending-semantic-search-low-hard.md` — Scope (semantic search UI)
