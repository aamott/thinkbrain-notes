- name: No handling of [[Target|Display]] or [[Target#heading]] wiki-link syntax
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/linkResolver.ts
- lines: 46-88
- description: |
    `resolveWikiLinkTarget` treats `target` as a bare note name. Common wiki-link
    extensions support two syntactic forms that this resolver does not address:

      - `[[Target|Display Text]]` — link to `Target`, render `Display Text`.
      - `[[Target#Heading]]` — link to a specific heading inside `Target`.

    Neither is mentioned in the doc (lines 46-69) nor handled in `normalize`
    (lines 27-30). If the parser (`markdown.ts`) already strips the `|Display` and
    `#Heading` portions before calling the resolver, this is fine — but the
    resolver's contract should document that assumption explicitly so callers know
    they must pre-split. If the parser does NOT pre-split, then `[[Target#Heading]]`
    will fail to resolve because `normalize("Target#Heading")` keeps the `#heading`
    portion and no note's filename/title/alias/path will match.

    Suggested fix:
      1. Confirm what `ParsedNote.wikiLinks[i].target` contains (check `markdown.ts`
         and `note-model.ts`). If it already strips display/anchor, add a doc line to
         `resolveWikiLinkTarget` stating the precondition.
      2. If it does not strip them, either strip them inside `resolveWikiLinkTarget`
         (and return both the resolved path and the anchor/display for the caller) or
         add a small `parseWikiLinkTarget(raw)` helper that does the split and have
         the indexer call it before resolving.
      3. Add tests covering `[[Target|Display]]` and `[[Target#Heading]]` end-to-end
         through `buildWikiLinkIndex` so the contract is pinned.
- verification: |
    Read `linkResolver.ts` lines 27-88. Confirmed `normalize` only trims, lowercases,
    and strips `.md`/`.markdown` — it does not handle `|` or `#`. The doc on
    `resolveWikiLinkTarget` does not state any precondition about pre-splitting.
    Did not inspect `markdown.ts`/`note-model.ts` (out of review scope) — flagged as
    a contract gap that needs cross-checking with the parser.
