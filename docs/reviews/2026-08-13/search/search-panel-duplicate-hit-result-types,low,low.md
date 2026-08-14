- name: `SearchPanel.tsx` imports `SearchResult` but annotates results as `SearchHit` — redundant type alias layer
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/search/SearchPanel.tsx
- lines: 5, 7, 35, 74, 154
- description: |
    `SearchPanel.tsx` imports both:
      - `searchService, type SearchResult` from `./searchService` (line 5)
      - `type SearchHit` from `./searchPanelModel` (line 7)

    `SearchResult` (searchService.ts:34-40) and `SearchHit` (searchPanelModel.ts:2-8) are structurally identical: same five fields (`relativePath`, `fileName`, `title: string | null`, `snippet`, `score`), same types.

    The panel uses *both*: it calls `searchService.search(...)` which returns `readonly SearchResult[]` (line 74) and assigns to `setResults` typed as `readonly SearchHit[]` (line 35, 76). The render map annotates `hit: SearchHit` (line 154). This works only because TypeScript's structural typing makes the two aliases interchangeable, but it means the panel pulls in `searchPanelModel` solely for a duplicate type name.

    If `search-panel-model-dead-reducer` is resolved by deleting the dead reducer, `SearchHit` should go too and the panel should use `SearchResult` everywhere. If the reducer is kept, pick one type and re-export it from the other module to avoid the duplicate definition.
- verification: |
    `SearchResult` (searchService.ts:34-40) and `SearchHit` (searchPanelModel.ts:2-8) field-by-field identical.
    grep `SearchHit` in SearchPanel.tsx → 3 matches (import, state type, render annotation).
    grep `SearchResult` in SearchPanel.tsx → 2 matches (import, the `await searchService.search` result).
- savings: 1 import + 1 duplicate interface (5 lines) once the dead-reducer finding decides the direction.
