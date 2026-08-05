# Canvas

Infinite canvas editor for spatial note arrangement — similar to Obsidian
Canvas. Users place notes as cards on an infinite 2D surface, draw connections
between them, and group related cards. Canvas state is persisted alongside the
vault so it remains Git-friendly and sync-compatible.

This is a **future epic** — low urgency, not yet started. No prerequisites.

## Scope

- Infinite panning and zooming canvas surface in the desktop app.
- Notes placed as cards on the canvas, rendered from their Markdown content.
- Connections (edges) drawn between cards, with labels and directional arrows.
- Card grouping: visual groups that contain multiple cards and move together.
- Canvas persistence: save/load canvas documents as files alongside the vault.
- Canvas management: create, open, rename, delete canvas documents from the
  explorer or a dedicated surface.
- Navigation aids: minimap, zoom-to-fit, keyboard pan/zoom.

## Architecture Decisions

- **Canvas documents are files in the vault.** A canvas is a single file stored
  alongside Markdown notes so it is Git-friendly and sync-compatible. The
  canonical format is JSON (`.canvas` extension, JSON schema), matching the
  Obsidian Canvas format for interoperability. A Markdown-with-frontmatter
  alternative was considered and rejected because spatial layout does not map
  cleanly to linear Markdown.
- **Canvas logic lives in `packages/core`.** The canvas document model (nodes,
  edges, positions, sizes) is platform-agnostic and must not depend on React or
  the DOM, per the hub-and-spoke rule. Rendering and interaction live in
  `apps/desktop`.
- **Cards reference notes by path.** A card points to a Markdown file in the
  vault via a relative path. The card renders the note's content (read-only or
  editable inline). Cards may also hold standalone text/media without a backing
  note.
- **Canvas rendering is a dedicated React surface**, not a CodeMirror
  extension. The infinite pan/zoom viewport is implemented with a transform
  layer (CSS transforms or a lightweight canvas/WebGL renderer) rather than
  scaling the DOM tree, to keep large canvases performant.
- **No proprietary backend.** Canvas files are plain files. Multi-user
  real-time collaboration is out of scope (see `collaboration` epic).
- **No third-party canvas framework lock-in for MVP of this epic.** Evaluate
  lightweight libraries (e.g. `react-flow`) but keep the canvas document model
  decoupled from the rendering library so it can be swapped.

## Dependencies

- None. This is a standalone epic. The note model (`note-model`) and file
  explorer (`workspace-explorer`) are already complete and provide the note
  references and file management foundation canvas cards build on.

## Non-Goals

- Real-time multi-user collaboration (see `collaboration` epic).
- Canvas export to image/PDF (may become a maintenance story later).
- Mobile canvas editing (Phase 2 / `mobile` epic).
- AI-assisted canvas layout (see `ai` epic).
- Embedding arbitrary web content (iframes of untrusted URLs) — security
  review required before considering.

## Status

- ⬜ Canvas document model (nodes, edges, positions, sizes) in `packages/core` — low
- ⬜ Canvas persistence (`.canvas` JSON load/save) — low
- ⬜ Infinite pan/zoom viewport surface — low
- ⬜ Note cards rendered from Markdown content — low
- ⬜ Connections between cards (edges, labels, arrows) — low
- ⬜ Card grouping (visual groups) — low
- ⬜ Canvas management UI (create/open/rename/delete) — low
- ⬜ Navigation aids (minimap, zoom-to-fit, keyboard nav) — low
