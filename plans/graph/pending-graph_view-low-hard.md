# Graph View

## Goal

Obsidian-style visual network of the vault: a dot per note, edges for resolved
wiki links, optional tag nodes. Delivered as an **extension** (loosely coupled,
registers its own panels/tab surface — follow existing extension conventions).
Graph assembly lives in `packages/core`, derived live from the wiki-link index
— never stored, no rendering dependency.

## Surfaces

- **Left-bar popout** — compact graph in the popout panel, plus a button that
  opens the full graph in a workspace tab.
- **Tab** — full graph view opened from that button.
- **Mobile** — tapping the button goes straight to the full graph view;
  no popout.
- Build the graph UI so its mount surface is swappable — we may move to
  tab-only later, so the view must not assume it lives in a popout.

## Options panel (right side)

Implementor picks the set; candidates: tag nodes on/off, orphans on/off,
filter by path/tag/status, local-graph depth around active note, physics
strength, labels on/off / label zoom threshold.

## Performance (hard requirement)

Must stay smooth with thousands of notes. The implementor plans for this
explicitly: budget for render (canvas/WebGL, not DOM), incremental layout,
and adaptive degradation — if the vault exceeds a size threshold or measured
frame rate drops, group/cluster nodes, drop labels, or limit visible nodes
rather than jank. Behavior should adapt at runtime, not just at load.

## Acceptance

- All notes render as nodes, resolved wiki links as directed edges; tag
  nodes optional via the panel.
- Pan, zoom, drag-to-rearrange (local only, not persisted); click a node to
  open its note — on every surface, including phone.
- Adaptive perf: correct clustering/limiting kicks in at scale or under
  measured jank, without freezing the UI.
- Node/tag styling via `--tn-*` theme tokens.
- Recomputes when the wiki-link index updates.
- Vitest covers assembly + clustering in `packages/core`.
- Discuss alternatives with owner before locking: renderer choice (canvas vs
  WebGL lib), physics lib, and any options beyond the candidate list.

## References

- `packages/core/src/note-model.ts`, `markdown.ts` — `WikiLink`, `extractWikiLinks`
- `plans/graph/` — epic; link resolution already shipped (see `done-summary.md`)
- `apps/desktop/src/extensions/` — extension host, panel/tab registration
- `apps/desktop/src-tauri/src/commands/search.rs` — native index backend
