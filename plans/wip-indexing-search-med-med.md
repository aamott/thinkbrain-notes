# Indexing and Search

Fast full-text search over local Markdown workspaces using a disposable SQLite
FTS5 cache. Markdown files on disk are the source of truth; the index is always
rebuildable and lives in OS app-data, never in the vault.

## Scope

- Background workspace indexing on open (batched, abortable, non-blocking).
- Incremental index upsert/remove on in-app create, save, rename, delete.
- Full-text search across filename, title, tags, aliases, and body text.
- Search UI panel with debounced type-ahead and result snippets.
- Per-workspace SQLite FTS5 cache stored in the OS app-data directory.

## Architecture Decisions

- **SQLite FTS5 as an ephemeral cache.** A single `documents_fts` virtual table
  holds all searchable fields; `path` is stored unindexed so results resolve
  back to a workspace-relative file. The cache is always derivable from disk.
- **Per-workspace cache files.** Each workspace gets its own SQLite file named
  from a stable FNV-1a hash of the canonicalized root, so distinct vaults never
  collide.
- **Frontend-driven indexing (OI-005).** The frontend reads files and runs the
  shared core `parseNote`, then sends records to native SQLite via Tauri
  commands. This is deliberate: it reuses the tested core parser and keeps the
  UI responsive by yielding to the event loop between batches. It trades some
  IPC overhead for parser correctness and a single parsing code path. This is
  not a pending item — do not create a story for it.
- **No file watcher yet (OI-003).** External edits are not reflected until the
  workspace is reopened. Full rebuild on open plus incremental upsert/remove on
  in-app mutations. A watcher is a deferred follow-up, not MVP debt.
- **One connection per command (OI-004).** Each index command opens its own
  `rusqlite::Connection`. Fine for single-user sequential use; revisit only if
  concurrency or perf becomes an issue.

## Status

- ✅ Native SQLite FTS5 index (schema, upsert, delete, clear, search) — `apps/desktop/src-tauri/src/lib.rs`
- ✅ Per-workspace cache path resolution in OS app-data — `apps/desktop/src-tauri/src/lib.rs` (`resolve_index_db_path`, `stable_workspace_hash`)
- ✅ Frontend indexing service (batched, abortable, progress) — `apps/desktop/src/search/searchService.ts`
- ✅ Background indexer hook on workspace open — `apps/desktop/src/search/useWorkspaceIndexer.ts`
- ✅ Incremental upsert/remove on in-app mutations — `apps/desktop/src/search/searchService.ts` (`indexDocument`, `removeIndexedDocument`)
- ✅ Search UI panel with debounced type-ahead and snippets — `apps/desktop/src/search/SearchPanel.tsx`
- ✅ Native command bridge and types — `apps/desktop/src/native/commands.ts`
- ⬜ File watcher for external edits (OI-003) — `pending-file_watcher-low-med.md`
- ⬜ Connection pooling / managed SQLite state (OI-004) — `pending-connection_pooling-low-med.md`
