# Wiki-Link Index for Backlinks

## Goal

Build a reverse index mapping each wiki-link target string to the list of notes that reference it. This is the data structure the backlinks panel and graph view need to compute edges without re-parsing every note on each query.

## Dependencies

- Link target resolution (`pending-link_target_resolution-low-med.md`) — ✅ done
- `extractWikiLinks` in `packages/core/src/markdown.ts` — ✅ done
- The search indexer's note-parsing pipeline (reads + parses all notes on workspace open and on mutations) — ✅ done

## Acceptance Criteria

- [x] A data structure (in-memory map or store) maps a note's `relativePath` to the wiki-link targets it contains, and a reverse map from resolved target path to the notes that link to it.
- [x] The index is rebuilt on workspace open and updated incrementally on `note.saved`, `note.created`, `note.renamed`, and `note.deleted` events (same events the search index store already consumes).
- [x] Resolution uses `resolveWikiLinkTarget` so that links by title, alias, filename, and path all resolve correctly.
- [x] Unresolved targets are tracked (so a renamed note can later surface dangling links that now point at it).
- [x] The index lives in `packages/core` as pure data structures; the desktop app provides the event-driven lifecycle wiring.
- [x] Tests cover: building the index from parsed notes, resolving targets, incremental update on save/create/rename/delete, unresolved target tracking.

## References

- `packages/core/src/linkResolver.ts` — `resolveWikiLinkTarget`, `NoteIndexEntry`
- `packages/core/src/markdown.ts` — `extractWikiLinks`, `parseNote`
- `apps/desktop/src/search/searchIndexStore.ts` — event subscription pattern to mirror
- `plans/graph/pending-backlinks_panel-low-med.md` — the primary consumer
