- name: Two `searchService` singletons — store creates its own instead of importing the exported one
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/search/searchIndexStore.ts
- lines: 81, /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/search/searchService.ts:287
- description: |
    `searchService.ts` exports a module-scoped singleton at line 287:
      `export const searchService: SearchService = createSearchService();`
    The doc comment on it (lines 281-286) explicitly says "One instance: it holds no state of its own ... and a second would only make it ambiguous which one a caller meant."

    `searchIndexStore.ts` then ignores that singleton and creates a *second* one at line 81:
      `const searchService: SearchService = createSearchService();`

    `SearchPanel.tsx` (line 5) and `journal.tsx` (line 10) import the exported singleton from `searchService.ts`, while `searchIndexStore.ts` uses its private one. So indexing (store) and querying (panel/journal) go through two different service instances. Today this is harmless because `createSearchService` returns a stateless object that only routes to `invokeNativeCommand` — but the doc's stated invariant ("one instance") is already violated, and any future state added to the service (caching, metrics, request dedup) would silently diverge between the two instances.

    Fix: drop line 81 in `searchIndexStore.ts` and import the existing singleton:
      `import { searchService, AbortError, createSearchService, ... } from "./searchService";`
    The `createSearchService` export is still needed by tests (`searchService.test.ts`, `searchMetadata.test.ts`), so keep the factory.
- verification: |
    grep `createSearchService` shows two production call sites:
      searchService.ts:287 (the exported singleton)
      searchIndexStore.ts:81 (the duplicate)
    grep `searchService\b` confirms the exported singleton is consumed by SearchPanel.tsx:5,74 and journal.tsx:10,298, while searchIndexStore.ts uses its private copy for indexWorkspace/indexDocument/removeDocument/clearIndex/queryMetadata.
- savings: ~1 line, but the real value is restoring the documented single-instance invariant.
