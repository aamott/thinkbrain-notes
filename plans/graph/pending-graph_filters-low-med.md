# Graph Filters (Tag / Path / Status)

## Goal

Let users narrow the graph view (full and local) by tag, folder path, and
note status so large vaults remain navigable. Filters apply to which nodes
are included; edges to excluded nodes are dropped.

Depends on the graph view story (`pending-graph_view`).

## Acceptance Criteria

- [ ] Filter UI lets users include/exclude notes by tag, by folder path prefix,
      and by `status` frontmatter value.
- [ ] Multiple filters combine with AND semantics; filter state is ephemeral
      (not persisted) unless workspace settings later opt in.
- [ ] Filtering updates the graph in place without a full re-layout stutter.
- [ ] Edge cases handled: a node passing filters but whose only links point at
      filtered-out nodes becomes an isolated node (not silently dropped).
- [ ] Filter logic lives in `packages/core` and is reusable by both full and
      local graph.
- [ ] Vitest covers filter combinations and edge cases in `packages/core`.

## References

- `packages/core/src/note-model.ts` — `NoteMetadata` (`tags`, `status`)
- `plans/pending-graph-low-hard.md` — this epic
- `plans/graph/pending-graph_view-low-hard.md` — prerequisite
