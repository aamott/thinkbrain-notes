- name: EMPTY_WIKI_LINK_INDEX is a shared mutable singleton; addNote API splits entry from parsedNote
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/wikiLinkIndex.ts
- lines: 45-51, 222-246
- description: |
    Two related API-design / immutability issues:

    **Issue A — `EMPTY_WIKI_LINK_INDEX` is a shared mutable singleton (lines 45-51).**
    The interface declares fields as `ReadonlyMap` and `readonly`, but at runtime the
    inner values are regular `Map` and `Array` instances. `ReadonlyMap` only prevents
    TypeScript from calling `set`/`delete` — a caller can cast (`as Map<string,
    string[]>`) and mutate the singleton's internals, corrupting every other consumer
    that imported the same singleton. Same for the `noteIndex: []` array. This is a
    footgun for a value documented as "useful as a starting point for incremental
    builds" (line 45).

    Suggested fix: either `Object.freeze` the singleton and its nested maps/arrays
    (and document that mutation will throw in strict mode), or export a function
    `createEmptyWikiLinkIndex(): WikiLinkIndex` that returns fresh maps each call.
    The function form is safer and aligns with the immutable-update pattern used by
    `addNote`/`removeNote`.

    **Issue B — `addNote` takes `entry: NoteIndexEntry` and `parsedNote: ParsedNote`
    as separate args (lines 222-226), with no runtime check that they describe the
    same note.**
    `buildWikiLinkIndex` takes `WikiLinkIndexInput[]` (`{ relativePath, parsedNote }`)
    and builds the entry internally. But `addNote` requires the caller to construct
    the `NoteIndexEntry` themselves and pass it alongside the `parsedNote`. Nothing
    enforces that `entry.relativePath` corresponds to `parsedNote` — a caller could
    pass `entry("A.md", ...)` with `parseNote("---\ntitle: B\n---\n...")` and silently
    corrupt the index with a mismatched entry/title/aliases pair.

    The test at `wikiLinkIndex.test.ts` lines 117 and 132 shows the intended usage:
    ```ts
    addNote(index, entry("C.md", "[[B]]"), parseNote("[[B]]"))
    ```
    Here `entry(...)` internally calls `buildNoteIndexEntry(note(...))` which parses
    the markdown a SECOND time, then `parseNote("[[B]]")` parses it a third time. The
    caller pays two parses and must keep the two strings in sync manually.

    Suggested fix: change `addNote`'s signature to accept either:
      - `addNote(index, input: WikiLinkIndexInput)` — consistent with
        `buildWikiLinkIndex`, builds the entry internally, eliminates the mismatch
        footgun and the double-parse; OR
      - `addNote(index, relativePath, parsedNote)` — same effect, even simpler.
    If the explicit-entry form must stay (e.g. for callers that already have an
    entry), add a dev-mode assertion `entry.relativePath === parsedNote.relativePath`
    (assuming `ParsedNote` carries its path) or document the precondition loudly.
- verification: |
    Read `wikiLinkIndex.ts` lines 45-51 — confirmed `EMPTY_WIKI_LINK_INDEX` is a
    single object literal with `new Map(...)` and `[]` internals, no `Object.freeze`.
    Read lines 222-246 (`addNote`) — confirmed signature is
    `(index, entry: NoteIndexEntry, parsedNote: ParsedNote)` with no runtime check
    that `entry` was built from `parsedNote`. Read `wikiLinkIndex.test.ts` lines
    117-132 — confirmed the test calls `entry(...)` and `parseNote(...)` separately
    with duplicated markdown strings.
