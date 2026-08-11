- name: linkResolver scans full note list 4x per resolution with no memoization
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/linkResolver.ts
- lines: 71-124
- description: |
    `resolveWikiLinkTarget` (lines 71-88) iterates the entire `notes` array once per
    priority level (`matchByFileName`, `matchByTitle`, `matchByAlias`, `matchByPath`),
    short-circuiting only when a level returns ≥1 match. In the worst case (no match)
    this is 4 full scans of the vault. Each matcher (lines 90-124) re-normalizes every
    note's `fileName`/`title`/`aliases`/`relativePath` on every call via `normalize`
    (lines 27-30), so the cost is `4 * N` string allocations per resolution.

    There is no pre-built lookup structure (e.g. `Map<normalizedFileName, NoteIndexEntry[]>`),
    so callers that resolve many targets (notably `buildReverseMaps` in `wikiLinkIndex.ts`)
    pay this cost repeatedly. For a vault of 10k notes with ~5 links/note, a full index
    build triggers ~50k resolution calls × 4 × 10k = 2B comparisons.

    Suggested fix: build normalized lookup maps once per `notes` array (or accept a
    pre-built index struct) and have `resolveWikiLinkTarget` consult those maps in
    priority order. This keeps the public API stable while turning per-call cost from
    O(4N) into O(1) average lookups + O(K log K) sort for the matching candidates only.
- verification: |
    Read `linkResolver.ts` lines 71-124. Confirmed the four matcher functions each call
    `notes.filter(...)` with `normalize(...)` inside the predicate, and that
    `resolveWikiLinkTarget` loops over `[matchByFileName, matchByTitle, matchByAlias,
    matchByPath]` calling each until one returns a non-empty array. No caching or
    precomputed index is present.
