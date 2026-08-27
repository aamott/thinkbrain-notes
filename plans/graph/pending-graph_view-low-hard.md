# Graph View

## Goal

Render a visual network of the whole vault: notes are nodes, wiki-link
connections are edges. A force-directed layout positions nodes; users can
pan, zoom, and click a node to open that note. The graph is derived live from
the wiki-link index — never stored.

Depends on link target resolution (shipped; see `plans/graph/done-summary.md`).

## Acceptance Criteria

- [ ] Graph view renders all notes as nodes and resolved wiki links as directed
      edges.
- [ ] Force-directed layout is stable and performant for vaults up to a few
      thousand notes (virtualize or sample beyond that).
- [ ] Pan, zoom, and drag-to-rearrange (local layout only, not persisted)
      work smoothly.
- [ ] Clicking a node opens the note in the editor.
- [ ] Node appearance reflects note status (e.g. `status` frontmatter field)
      via theme tokens, not hardcoded colors.
- [ ] Graph recomputes when the index updates (file save / reindex).
- [ ] Graph assembly (nodes/edges) is in `packages/core` with no rendering
      dependency; rendering is desktop-only in `apps/desktop`.
- [ ] Vitest covers graph assembly in `packages/core`.

## References

- `packages/core/src/note-model.ts` — `WikiLink`, `NoteMetadata`
- `packages/core/src/markdown.ts` — `extractWikiLinks`
- `plans/wip-indexing-search-med-med.md` — indexing-search epic and index lifecycle
- `apps/desktop/src-tauri/src/commands/search.rs` — shipped native index backend
- A future typed frontend bridge remains planned for native index access; no bridge
  file is assigned yet.
- `plans/pending-graph-low-hard.md` — this epic
- `plans/graph/done-summary.md` — link target resolution, prerequisite (shipped)
