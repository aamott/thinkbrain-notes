- name: Cross-file O(N²·L) index build from linkResolver × wikiLinkIndex interaction
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/wikiLinkIndex.ts
- lines: 109-128
- description: |
    This is the cross-file compound of two per-file findings
    (`linkResolver-o(n)-per-call-no-memoization` and
    `wikiLinkIndex-reverse-maps-o(n²)-recompute`), called out separately because
    fixing either file alone yields only partial improvement and the two fixes must
    be designed together.

    The cost chain on a full `buildWikiLinkIndex(inputs)` call:

      - `buildWikiLinkIndex` (lines 145-158) builds `forward` (O(N·L)) and calls
        `buildReverseMaps(forward, noteIndex)`.
      - `buildReverseMaps` (lines 109-128) iterates every `(source, target)` pair in
        `forward` — that's `Σ L_i ≈ N·L` pairs — and calls `resolveWikiLinkTarget`
        for each.
      - `resolveWikiLinkTarget` (`linkResolver.ts` lines 71-88) scans the entire
        `noteIndex` (size N) up to 4 times per call, re-normalizing every entry's
        `fileName`/`title`/`aliases`/`relativePath` inside each `filter` predicate.

    Total: `O(N·L · 4N) = O(N²·L)`. For N=10k, L=5, that's ~2B comparisons and ~2B
    short-string allocations just for the normalize calls. The same chain runs on
    every `addNote`/`removeNote`, so each editor save repeats the full cost.

    Why the two fixes must be designed together:
      - If only `linkResolver` is fixed (pre-built lookup maps inside
        `resolveWikiLinkTarget`), the maps are rebuilt on EVERY call, so the
        per-call cost becomes O(N) to build the maps + O(1) lookups — net O(N·L·N)
        = O(N²·L) unchanged, because the map rebuild dominates.
      - If only `wikiLinkIndex` is fixed (targeted reverse-map patches), the common
        case (content-only save) becomes O(L_changed · 4N) = O(L·N), but a full
        build and any noteIndex-change save still pay O(N²·L).
      - Fixing both: `wikiLinkIndex` builds the lookup maps ONCE per noteIndex
        version and passes them to a new `resolveWikiLinkTargetWithIndex(target,
        index)`; full build becomes O(N·L·K log K) where K is candidates per target
        (usually tiny); content-only save becomes O(L_changed · K log K).

    Suggested plan:
      1. In `linkResolver.ts`, add a `buildNoteIndexLookup(notes): NoteIndexLookup`
         that pre-builds `Map<normalized, NoteIndexEntry[]>` for filename, title,
         alias, and path. Export both the lookup type and a
         `resolveWikiLinkTargetWithIndex(target, lookup): string | null` that uses
         it. Keep the existing `resolveWikiLinkTarget(target, notes)` as a thin
         wrapper that builds a lookup and delegates (so existing callers still work).
      2. In `wikiLinkIndex.ts`, have `buildWikiLinkIndex`/`addNote`/`removeNote`
         build the lookup once from `noteIndex` and pass it to
         `buildReverseMaps(forward, lookup)`. This makes the per-target cost O(K log
         K) instead of O(4N).
      3. THEN layer targeted reverse-map patches on top for the content-only-save
         case (skip full recompute when only one note's forward links changed and
         no entry's title/alias/filename/path changed).
      4. Add a benchmark test (e.g. 1k/5k/10k synthetic notes) to lock in the cost
         model and catch regressions.

    This is the highest-impact finding from the review.
- verification: |
    Read `wikiLinkIndex.ts` lines 109-128 and 145-158, and `linkResolver.ts` lines
    71-88 and 90-124. Traced the full call chain from `buildWikiLinkIndex` →
    `buildReverseMaps` → `resolveWikiLinkTarget` → four `notes.filter(matcher)`
    calls. Confirmed the O(N²·L) cost and that both per-file fixes in isolation
    leave the asymptotic cost unchanged.
