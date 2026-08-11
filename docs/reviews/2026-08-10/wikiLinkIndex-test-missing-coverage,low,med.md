- name: wikiLinkIndex.test.ts missing coverage for normalization, empty title, self-links, round-trips
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/wikiLinkIndex.test.ts
- lines: 1-209
- description: |
    The test suite covers the happy paths for build/add/remove well, but has gaps
    that leave known edge cases unverified. Several of these directly correspond to
    bugs flagged in sibling findings:

      - **No test for case-insensitive dedupe in forward map** — would catch Bug A
        in `wikiLinkIndex-case-normalization-inconsistency`. Add a note with
        `[[A]] [[a]]` and assert `getForwardLinks(idx, "X.md")` has one entry.
      - **No test for `unresolved` keyed by normalized form** — would catch Bug B in
        the same finding. Add two notes with `[[my note]]` and `[[My Note]]` and
        assert both sources appear under one unresolved key.
      - **No test for `EMPTY_WIKI_LINK_INDEX` as a starting point** — the constant is
        exported (line 46 of source) but never exercised. Add a test that builds an
        index via `addNote(EMPTY_WIKI_LINK_INDEX, ...)` and verifies the result.
      - **No test for `addNote` upserting an existing note's entry (not just content)
        with new aliases/title** — the "updates links on save" test (lines 122-137)
        only changes content, not the entry's title/aliases. Add a test where a note
        gains a new alias and verify a `[[NewAlias]]` from another note now resolves.
      - **No test for `removeNote` on a non-existent path** — should be a no-op
        returning an equivalent index. Currently `removeNote` (source lines 200-212)
        still recomputes everything; a test would pin whether that is acceptable.
      - **No explicit test for self-links** — the comment at lines 89-91 mentions
        self-links but the assertion `expect(getBacklinks(index, "C.md")).toContain
        ("C.md")` is buried in the general backlinks test. Add a focused test that
        documents whether self-links are intended (graph view will render self-loops).
      - **No test for a note with zero wiki-links** — `dedupeTargets` returns `[]`,
        but there's no assertion that `getForwardLinks(idx, "lonely.md")` is `[]`
        for a note with no links (the "lonely" note at line 203 is used for remove,
        not for forward-map emptiness).
      - **No test for `parsedNote.aliases` being undefined/empty** — type-safety
        guard. `buildNoteIndexEntry` (source lines 60-68) passes
        `parsedNote.aliases` straight through; if the parser ever yields
        `undefined`, the `readonly string[]` contract is violated at runtime.
      - **No test for `addNote` then `removeNote` round-trip** — adding a note and
        removing it should yield an index equivalent to the original (modulo array
        identity). This pins the invariant that the two are inverses.
      - **No test for backlinks ordering / determinism** — `pushUnique` preserves
        forward-iteration order, which is Map insertion order, which is the order
        notes were passed to `buildWikiLinkIndex`. A test would pin this so a future
        refactor (e.g. switching to Sets per Smell A) doesn't accidentally change
        ordering and break UI snapshots.

    Suggested fix: add the above as small focused tests. Most are 5-10 lines each.
- verification: |
    Read `wikiLinkIndex.test.ts` lines 1-209 in full. Cross-referenced each test
    against the source's documented behaviors and against the bugs flagged in
    sibling findings. Confirmed none of the listed cases are covered.
