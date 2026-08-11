- name: buildReverseMaps recomputes all backlinks/unresolved on every mutation (O(N²·L))
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/wikiLinkIndex.ts
- lines: 109-128, 200-246
- description: |
    `buildReverseMaps` (lines 109-128) is the single source of truth for the reverse
    maps. It iterates every entry in `forward` and calls `resolveWikiLinkTarget` for
    every target. Since `resolveWikiLinkTarget` is O(4N) over `noteIndex` (see finding
    `linkResolver-o(n)-per-call-no-memoization`), a full build is O(N·L·4N) = O(N²·L).

    Crucially, `addNote` (lines 222-246) and `removeNote` (lines 200-212) BOTH call
    `buildReverseMaps` on every invocation, even though only one note changed. The
    doc (lines 99-108, 214-221) explicitly justifies this as "keeps the logic simple
    and correct" because a title/alias change on one note can affect resolution of
    links from OTHER notes. That correctness argument is valid, but the performance
    cost is severe for incremental updates on large vaults: saving a single note
    re-resolves every link in the vault.

    For a 10k-note vault with ~5 links/note, each save triggers ~50k resolution calls
    × 4 × 10k = 2B comparisons. On a typical laptop this will be noticeable (hundreds
    of ms to seconds) and will block the editor save path.

    Suggested fix (in priority order):
      1. **Memoize `resolveWikiLinkTarget`'s per-call cost** by pre-building
         `Map<normalized, NoteIndexEntry[]>` lookup tables for filename, title, alias,
         and path. Rebuild these only when `noteIndex` changes (i.e. on `addNote`/
         `removeNote`), not on every resolution. This alone turns the per-call cost
         from O(4N) into O(1) lookups + O(K log K) sort for the matching candidates.
      2. **Targeted reverse-map patches** for the common case where a note's content
         changed but no other note's title/alias/path changed. In that case only the
         changed note's forward links need re-resolution; other notes' backlinks only
         need to drop/add the changed note as a source. Fall back to full recompute
         when the noteIndex entry itself changed (title/alias/filename/path).
      3. **Document the cost model** in the module docstring so the desktop app knows
         to debounce/coalesce rapid saves before calling `addNote`.

    This finding compounds with `linkResolver-o(n)-per-call-no-memoization` — fixing
    only one yields modest improvement; fixing both yields the full speedup.
- verification: |
    Read `wikiLinkIndex.ts` lines 109-128 (`buildReverseMaps`), 145-158
    (`buildWikiLinkIndex`), 200-212 (`removeNote`), 222-246 (`addNote`). Confirmed all
    three call sites invoke `buildReverseMaps(forward, noteIndex)` which loops over
    `forward` and calls `resolveWikiLinkTarget` per target. Cross-referenced with
    `linkResolver.ts` lines 71-88 to confirm the per-call cost.
