# Vector Storage

## Goal

Store generated embeddings in a per-workspace vector cache colocated with the
existing SQLite FTS5 index, in the OS application-data directory (never inside
the workspace). The cache is disposable and rebuildable from disk, matching the
existing index policy.

## Acceptance Criteria

- [ ] Embeddings are persisted per-workspace in OS app-data, keyed by
      workspace-relative path.
- [ ] Storage lives alongside the existing `documents_fts` SQLite cache (same
      app-data index directory or a sibling vector store).
- [ ] Deleting the vector cache and rebuilding from source files restores full
      semantic search.
- [ ] Upsert and delete by path keep the vector cache in sync with edits.
- [ ] Schema/versioning handles model changes (different embedding dimensions)
      without corrupting search.
- [ ] No app data is written inside the workspace.

## References

- `apps/desktop/src-tauri/src/lib.rs` — `resolve_index_db_path`, `open_index_connection`, `init_index_schema`
- `apps/desktop/src/search/searchService.ts` — `indexWorkspace`, `indexDocument`, `removeIndexedDocument`
- `plans/pending-semantic-search-low-hard.md` — Architecture Decisions (ephemeral cache)
