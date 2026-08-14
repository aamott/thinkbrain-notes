- name: `selectBacklinks` and the re-exported `getBacklinksFromIndex` in `wikiLinkIndexStore.ts` are dead — no production callers
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/wikiLinks/wikiLinkIndexStore.ts
- lines: 22-34 (imports + re-export), 236-238 (`selectBacklinks`)
- description: |
    `wikiLinkIndexStore.ts` does two things that have no production consumer:

    1. Re-exports `getBacklinksFromIndex` (line 34): `export { getBacklinksFromIndex };` — this is `getBacklinks` from `@thinkbrain/core` aliased on import (line 22) and re-exported under the alias. grep across the whole repo for `getBacklinksFromIndex` (excluding test files) → 0 production importers. The only consumers are `wikiLinkIndexStore.test.ts` (which imports it directly from `@thinkbrain/core` at line 12, not from the store) — so even the test does not use the re-export.

    2. `selectBacklinks(relativePath)` (236-238): a selector helper that calls `getBacklinksFromIndex(useWikiLinkIndexStore.getState().wikiLinkIndex, relativePath)`. grep `selectBacklinks` across the whole repo → 1 match, the definition itself. No caller anywhere, including tests.

    Both are dead. The backlinks panel and graph view (the documented consumers per the file header, lines 13-14) do not import either symbol — they presumably read `wikiLinkIndex` from the store and call `getBacklinks` from `@thinkbrain/core` directly, or compute edges another way.

    Fix: remove lines 22 (the `getBacklinks as getBacklinksFromIndex` import), 33-34 (the re-export comment + `export { getBacklinksFromIndex }`), and 236-238 (`selectBacklinks`). Keep `getBacklinks` importable from `@thinkbrain/core` directly by any future consumer.

    Note: verify the backlinks panel / graph view do not import these before deleting — they may be wired in a file outside this review set. The grep across the whole repo (not just the reviewed files) shows no importer, so they are safe to remove.
- verification: |
    grep `selectBacklinks` (whole repo) → 1 match: the definition at wikiLinkIndexStore.ts:236.
    grep `getBacklinksFromIndex` (whole repo) → 13 matches: 4 in wikiLinkIndexStore.ts (import, re-export, selector body), 9 in wikiLinkIndexStore.test.ts — and the test imports it from `@thinkbrain/core` (line 12), NOT from the store. So the store's re-export has zero consumers.
    grep `getBacklinksFromIndex` excluding test files → 0 matches outside wikiLinkIndexStore.ts itself.
- savings: ~6 lines (the `as getBacklinksFromIndex` import alias, the re-export block, and `selectBacklinks`).
