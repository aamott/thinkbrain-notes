# Graph

> Future epic (low urgency, stub). Backlinks and graph view built on top of the
> wiki-link index. The backlinks panel is elevated to medium urgency; the rest
> remains low. Read `plans/app-vision.md` and `plans/wip-note-model-low-hard.md` before
> starting any story here.

## Goal

Surface the connections between notes that already exist implicitly in wiki
links. Give users a backlinks panel for the active note and a visual graph of
the whole vault (and local neighborhoods), so they can navigate and understand
how notes relate.

## Scope

In scope:

- backlinks panel — list notes that link to the active note (via `[[Target]]`)
- graph view — visual network of notes (nodes) and wiki-link connections (edges)
- local graph — neighborhood around the active note
- graph filters — by tag, path, and status

Non-goals (out of scope for this epic):

- semantic / AI-derived edges (belongs to `semantic-search` / `ai`)
- editing relationships by dragging nodes (graph is read-only navigation)
- canvas / infinite-canvas editor (separate `canvas` epic)
- graph persistence — the graph is always derived from the wiki-link index,
  which is itself rebuildable from disk

## Architecture Decisions

- **Graph is derived, never stored.** Nodes and edges are computed from the
  existing wiki-link index (populated by `extractWikiLinks` in
  `packages/core/src/markdown.ts`). No separate graph database or sidecar file.
  This honors the "index is an ephemeral cache, always rebuildable" rule.
- **Backlinks = reverse lookup over the wiki-link index.** A backlink to note
  `A` is any note whose `wikiLinks` contain a `target` resolving to `A`. Target
  resolution must account for aliases (frontmatter `aliases`) and
  path/filename normalization, matching how the indexer resolves links.
- **Graph logic lives in `packages/core`.** Node/edge assembly, target
  resolution, and filtering are platform-agnostic and must not depend on React
  or a rendering library. The desktop app provides the rendering adapter.
- **Rendering is desktop-only for now.** The graph view uses a force-directed
  layout rendered in the desktop app (`apps/desktop`). Mobile (Tauri Mobile
  build target, Phase 2) is out of scope until core adapter interfaces exist.
- **No inline styles.** Graph UI uses CSS Modules co-located with components,
  per the styling rule.

## Dependencies

- `note-model` (done) — wiki-link parsing exists: `WikiLink` type
  (`packages/core/src/note-model.ts`), `extractWikiLinks`
  (`packages/core/src/markdown.ts`), aliases in `NoteMetadata`.
- `indexing-search` (MVP core done) — the wiki-link index that backlinks and
  graph edges are derived from. `plans/indexing-search/` retains three pending
  follow-ups — structured frontmatter records and facet queries
  (`pending-frontmatter_metadata_facets-high-hard.md`), an external-edit file
  watcher (`pending-file_watcher-low-med.md`), and managed SQLite connection
  pooling (`pending-connection_pooling-low-med.md`). These are enhancements and
  do not block this epic.

No other epic blocks this one. `semantic-search` and `ai` are independent
future epics; this epic uses only explicit wiki-link edges.

## Validation

- Vitest unit tests for graph assembly / target resolution / filtering in
  `packages/core` (co-located `*.test.ts`).
- Vitest for the desktop graph/backlink service wrappers.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Manual / E2E: open a vault with linked notes, verify backlinks panel and
  graph render correct nodes/edges; verify filters narrow the graph.

## Status

- ✅ Link target resolution (aliases + path normalization) — see
  `pending-link_target_resolution-low-med.md`
- ⬜ Clickable wiki-link navigation — click `[[Target]]` to open the note — see
  `pending-clickable_wiki_link_navigation-low-med.md`
- ⬜ Wiki-link autocomplete — `[[` triggers a note picker — see
  `pending-wiki_link_autocomplete-med-med.md`
- ⬜ Wiki-link index for backlinks — reverse index (target → linking notes) — see
  `pending-wiki_link_index-med-med.md`
- ⬜ Backlinks panel — list notes linking to the active note — see
  `pending-backlinks_panel-med-med.md` (elevated to medium urgency)
- ⬜ Automatic link update on rename — rewrite `[[old]]` → `[[new]]` across the vault — see
  `pending-automatic_link_update_on_rename-med-hard.md`
- ⬜ Graph view — visual network of notes and wiki-link edges — see
  `pending-graph_view-low-hard.md`
- ⬜ Local graph around active note — see `pending-local_graph-low-hard.md`
- ⬜ Graph filters (tag / path / status) — see `pending-graph_filters-low-med.md`
