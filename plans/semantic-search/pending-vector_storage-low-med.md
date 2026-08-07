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

- `plans/wip-indexing-search-med-med.md` — indexing-search epic and cache policy
- `apps/desktop/src-tauri/src/commands/search.rs` — shipped native per-workspace SQLite cache and index commands
- A future typed frontend bridge remains planned for native index commands; no bridge file is assigned yet.
- `plans/pending-semantic-search-low-hard.md` — Architecture Decisions (ephemeral cache)
