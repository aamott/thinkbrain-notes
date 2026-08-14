- name: `searchPanelModel.ts` reducer/state/action types are dead in production — only the `SearchHit` alias is used
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/search/searchPanelModel.ts
- lines: 10-65 (whole file minus the `SearchHit` interface at 2-8)
- description: |
    `searchPanelModel.ts` exports:
      - `SearchHit` (interface, lines 2-8)
      - `SearchIndexState` (type, 11-15)
      - `SearchPanelState` (interface, 18-24)
      - `SearchPanelAction` (type, 27-32)
      - `initialSearchPanelState` (const, 35-41)
      - `searchPanelReducer` (function, 49-65)

    Production usage (non-test):
      - `SearchPanel.tsx:7` imports `type { SearchHit }` — the only production import.
      - `SearchPanel.tsx` does NOT use `searchPanelReducer`, `SearchPanelState`, `SearchPanelAction`, `initialSearchPanelState`, or `SearchIndexState`. The panel manages its state with `useState` + a `useEffect` debounce (lines 34-94), not a reducer.

    Test usage:
      - `SearchPanel.test.tsx:4` imports `initialSearchPanelState, searchPanelReducer` and exercises the reducer in isolation (lines 26-74). The reducer tests assert behavior of a reducer the production code never runs.

    So `SearchIndexState`, `SearchPanelState`, `SearchPanelAction`, `initialSearchPanelState`, and `searchPanelReducer` (≈55 of the file's 65 lines) are dead in production and only kept alive by tests that test dead code. `SearchHit` is structurally identical to `SearchResult` in `searchService.ts` (lines 34-40) — same five fields, same types — so even the one used export is a duplicate type alias.

    Two options:
      1. If the reducer was intended as the panel's state model, wire `useReducer(searchPanelReducer, initialSearchPanelState)` into `SearchPanel.tsx` and delete the `useState`/debounce-ref machinery (which would also let `lib/debounce.ts`'s `createDebounced` replace the hand-rolled timer). This makes the tests test real code.
      2. If the `useState` approach is the chosen one, delete `SearchIndexState`, `SearchPanelState`, `SearchPanelAction`, `initialSearchPanelState`, `searchPanelReducer`, and the reducer tests; have `SearchPanel.tsx` import `SearchResult` from `searchService.ts` directly and drop `SearchHit`.

    Option 2 is the smaller change and matches how the panel actually works today.
- verification: |
    grep `from "./searchPanelModel"` (and `../search/searchPanelModel`) → 2 matches: SearchPanel.tsx:7 (imports only `SearchHit`), SearchPanel.test.tsx:4 (imports `initialSearchPanelState, searchPanelReducer`).
    grep `searchPanelReducer|SearchPanelState|SearchPanelAction|initialSearchPanelState|SearchIndexState` across the repo → only matches in searchPanelModel.ts itself, SearchPanel.test.tsx, and plan docs (no production callers).
    `SearchHit` (searchPanelModel.ts:2-8) vs `SearchResult` (searchService.ts:34-40): identical field names and types.
- savings: ~55 lines of dead production code + ~50 lines of tests for it = ~105 lines removed (option 2), or a real reducer wiring that deletes the panel's hand-rolled debounce/timer block (option 1).
