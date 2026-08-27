# Local Graph Around Active Note

## Goal

Show a focused graph of the neighborhood around the active note: the note
itself, its direct wiki-link targets (outgoing), and notes that link to it
(incoming backlinks), optionally expanded one more hop. Useful for navigating
context without rendering the entire vault.

Depends on the graph view story (`pending-graph_view`) and link target
resolution (shipped; see `plans/graph/done-summary.md`).

## Acceptance Criteria

- [ ] Local graph renders the active note plus its direct neighbors (incoming
      and outgoing links), centered on the active note.
- [ ] Optional depth control (1 hop default, 2 hops available) limits the
      neighborhood size.
- [ ] Clicking a neighbor node opens that note and re-centers the local graph
      on it.
- [ ] Local graph updates when the active note changes or the index updates.
- [ ] Reuses the same node/edge assembly and rendering as the full graph view
      (no separate rendering pipeline).
- [ ] Vitest covers the neighborhood-selection logic in `packages/core`.

## References

- `packages/core/src/note-model.ts` — `WikiLink`, `NoteMetadata`
- `packages/core/src/markdown.ts` — `extractWikiLinks`
- `plans/pending-graph-low-hard.md` — this epic
- `plans/graph/pending-graph_view-low-hard.md` — prerequisite
- `plans/graph/done-summary.md` — link target resolution, prerequisite (shipped)
