# Canvas Document Model

## Goal

Define a platform-agnostic canvas document model in `packages/core`: nodes
(cards), edges (connections), positions, sizes, and groups. The model must not
depend on React or the DOM, per the hub-and-spoke rule. This is the data layer
that persistence and rendering build on.

## Acceptance Criteria

- [ ] Types defined for canvas nodes (note-backed, text, media), edges
      (directed/undirected, labeled), and groups (containers holding nodes).
- [ ] Node model includes position (x, y), size (width, height), z-index, and
      a reference to a backing note path (when applicable).
- [ ] Edge model includes source/target node ids, optional label, and
      direction.
- [ ] Group model contains child node ids and its own position/size.
- [ ] Pure helper functions for CRUD on nodes/edges/groups (add, remove,
      update, move).
- [ ] Unit tests cover model invariants and helpers.

## References

- `packages/core/src/` — new canvas module (e.g. `canvas-model.ts`)
- `plans/canvas.md` — architecture decisions
- `packages/core/src/note-model.ts` — note reference shape
