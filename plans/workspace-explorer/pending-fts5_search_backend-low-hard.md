# SQLite FTS5 Search Backend

**Status:** integration note · backend owned by `indexing-search`

## Goal

Connect the explorer-owned search surfaces to the existing indexing-search FTS5
backend. This story does not create a second SQLite database, FTS5 table, or
index lifecycle.

## Design

- The indexing-search epic owns the Rust FTS5 schema, workspace cache, indexing
  commands, and search queries in `apps/desktop/src-tauri/src/commands/search.rs`.
- The explorer/UI layer consumes the native `index_documents`, `search_index`,
  `clear_index`, and `remove_index_document` commands through the desktop bridge.
- The Command Palette and Search sidebar use the shared backend rather than
  filtering explorer paths locally.

## Acceptance Criteria

- [ ] Explorer/search surfaces have a typed frontend bridge to the existing
      indexing-search commands.
- [ ] Search results open the selected workspace-relative file and show the
      backend-provided snippet.
- [ ] Explorer mutations and workspace switches use the indexing-search update
      lifecycle; no parallel explorer-owned index is introduced.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## References

- `apps/desktop/src-tauri/src/commands/search.rs` — FTS5 backend and commands
- `apps/desktop/src-tauri/src/commands/mod.rs` — command registration
- `apps/desktop/src/search/SearchPanel.tsx` — current unavailable UI placeholder
- `apps/desktop/src/search/searchPanelModel.ts` — search panel state model
- `plans/wip-indexing-search-med-med.md` — backend/index owner and open work
