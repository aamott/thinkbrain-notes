- name: resolveWikiLinkTarget runs per wiki link per decoration rebuild with no caching
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/livePreview/nodes/links.ts
- lines: 88-98
- description: |
    The `wikiLink` node handler calls `resolveWikiLinkTarget(target, noteIndex)`
    (line 95) for every `WikiLink` node in the visible viewport on every
    decoration rebuild. Rebuilds are triggered by doc/selection/viewport/parse
    changes (`livePreview/index.ts` lines 38-56), so simply moving the cursor
    through a note re-resolves every link in view.

    For small vaults this is invisible. For large vaults where
    `resolveWikiLinkTarget` is O(n) over the index (typically a linear scan
    over `fileName`/`title`/`aliases`), a note containing many links can make
    cursor movement janky. The same target is also resolved again at click
    time (`livePreview/index.ts` line 105).

    Low urgency now; revisit when the wiki-link index grows. Possible
    optimizations, in order of effort:
      - Memoize per `target` string within a single `buildDecorations` pass
        (a `Map<string, boolean>` scoped to the pass) so a note that links the
        same target N times resolves it once.
      - Precompute a `Map<string, string>` from
        `fileName|title|alias (lowercased) → relativePath` once per `noteIndex`
        reference change (in the extension factory) so decoration builds are
        O(links) lookups instead of O(links × index).
      - Have the click handler reuse the same lookup map rather than calling
        `resolveWikiLinkTarget` again.
- verification: |
    `links.ts` line 95 calls `resolveWikiLinkTarget` inside the `wikiLink`
    `NodeHandler` with no memoization. `livePreview/index.ts` line 105 calls
    it again in the click handler. `buildDecorations` is invoked from both the
    plugin constructor and `update` (lines 33, 53), the latter firing on every
    cursor move.
