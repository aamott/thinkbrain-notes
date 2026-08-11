- name: linkResolver.test.ts missing coverage for path edge cases and ambiguous matches
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/linkResolver.test.ts
- lines: 1-124
- description: |
    The test suite covers the documented priority order and tie-breaks well, but has
    gaps that leave the resolver's contract under-specified:

      - **No test where length and depth diverge** for `compareCandidates` (see
        separate finding `linkResolver-tiebreak-uses-path-length-not-depth`). The
        existing tie-break tests (lines 96-110) all have length and depth agreeing.
      - **No test for `.markdown` extension in path matching** — only filename-level
        `.markdown` is tested (lines 66-72). A target like `folder/sub/Deep.markdown`
        against a note at `folder/sub/Deep.markdown` is not exercised through
        `matchByPath`.
      - **No test for target with leading/trailing slashes** (`/folder/sub/Deep`,
        `folder/sub/Deep/`) — these would silently fail to resolve; a test would
        pin whether that is intended.
      - **No test for `./` or `../` relative-style targets** — even if unsupported,
        an explicit `expect(...).toBeNull()` would document the contract.
      - **No test for aliases containing special characters** (brackets, pipes,
        colons) — relevant if the parser doesn't strip `|Display`.
      - **No test for multiple aliases on one note matching the same target** —
        `matchByAlias` uses `.some(...)`, so this should resolve once, but there's
        no regression guard.
      - **No test for a note whose `title` is an empty string** — `buildNoteIndexEntry`
        stores `parsedNote.metadata.title` as-is; if the parser yields `""`,
        `matchByTitle` will normalize to `""` and never match (target is non-empty
        post-normalize), but the empty title still causes an extra iteration. A test
        would pin "empty title is treated as no title".
      - **No test for `aliases` containing duplicates or empty strings** —
        `matchByAlias` would still work but the index could carry junk.

    Suggested fix: add the above cases as small focused tests. Most are one-liner
    `expect(resolveWikiLinkTarget(...)).toBe(...)` assertions.
- verification: |
    Read `linkResolver.test.ts` lines 1-124 in full. Cross-referenced each documented
    behavior in `linkResolver.ts` (lines 46-88 doc comment) against the tests and
    confirmed the listed cases are absent.
