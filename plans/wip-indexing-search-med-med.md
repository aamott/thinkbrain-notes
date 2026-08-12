# Indexing and Search

Fast full-text search over local Markdown workspaces using a disposable SQLite
FTS5 cache. Markdown files on disk are the source of truth; the index is always
rebuildable and lives in OS app-data, never in the vault.

## Scope

- Background workspace indexing on open (batched, abortable, non-blocking).
- Incremental index upsert/remove on in-app create, save, rename, delete.
- Full-text search across filename, title, tags, aliases, and body text.
- Structured frontmatter indexing and facet queries for feature-owned filters (D41).
- Search UI panel with debounced type-ahead and result snippets.
- Per-workspace SQLite FTS5 cache stored in the OS app-data directory.

## Architecture Decisions

- **SQLite FTS5 as an ephemeral cache.** A single `documents_fts` virtual table
  holds all searchable fields; `path` is stored unindexed so results resolve
  back to a workspace-relative file. The cache is always derivable from disk.
- **Per-workspace cache files.** Each workspace gets its own SQLite file named
  from a stable FNV-1a hash of the canonicalized root, so distinct vaults never
  collide.
- **One platform-owned derived metadata cache (D41).** Structured frontmatter and
  facet values extend the existing rebuildable index; features do not maintain
  parallel caches or treat indexed metadata as source of truth.
- **Frontend-driven indexing (OI-005).** The frontend reads files and runs the
  shared core `parseNote`, then sends records to native SQLite via Tauri
  commands. This is deliberate: it reuses the tested core parser and keeps the
  UI responsive by yielding to the event loop between batches. It trades some
  IPC overhead for parser correctness and a single parsing code path. This is
  not a pending item — do not create a story for it.
- **The watcher reports, the frontend indexes (OI-003).** A native `notify`
  watcher detects edits made outside the app and reports which paths changed;
  it deliberately parses nothing, because indexing stays frontend-driven per
  OI-005. The frontend republishes those changes as the same `note.*` events an
  in-app edit produces, so the search index, wiki-link index and calendar all
  stay fresh without knowing a watcher exists. App writes record an expected
  echo so the watcher does not re-report the app's own saves.
- **Pooled connections, never evicted (OI-004).** Index commands share a
  per-workspace `rusqlite::Connection` from `SEARCH_CONNECTIONS`. Nothing
  removes a handle when a workspace closes; revisit only if that matters.

## Known limits of the watcher

- **Only verified on Linux.** The crate is cross-platform and both the paired
  and unpaired rename shapes are handled, but CI runs `ubuntu-latest` only, so
  macOS and Windows are portable by construction rather than by evidence.
- **A symlinked folder inside the vault is reported twice and never suppressed.**
  `notify` follows symlinks while the app records the canonical path, so the
  recorded write and the reported event disagree. Costs a redundant reindex, not
  a missed change.
- **An in-app folder delete or rename rebuilds the index.** Deliberate: the OS
  names only the folder, so the notes inside it cannot be enumerated to drop
  them individually. This also fixes a standing bug where deleting a folder in
  the app left every note inside it in the index.
- **An outside write inside the same debounce window as one of ours is missed**
  until that note changes again — the two are genuinely indistinguishable. See
  the module docs in `watcher.rs`.

## Status

- ✅ Native SQLite FTS5 index (schema, upsert, delete, clear, search) — `apps/desktop/src-tauri/src/commands/search.rs`
- ✅ Per-workspace cache path resolution in OS app-data — `apps/desktop/src-tauri/src/commands/search.rs` (`resolve_index_db_path`, `stable_workspace_hash`)
- ✅ Frontend indexing service (batched, abortable, progress) — `apps/desktop/src/search/searchService.ts` (`createSearchService`, `indexWorkspace`, `indexDocument`, `removeDocument`, `search`)
- ✅ Background indexer hook on workspace open — `apps/desktop/src/search/searchIndexStore.ts` (`indexWorkspace` called from `DesktopShell.handleWorkspaceOpened`); aborts in-flight indexing on workspace switch
- ✅ Incremental upsert/remove on in-app mutations — `searchIndexStore.subscribeToEvents()` wired in `DesktopShell`; listens to `note.saved`/`note.created`/`note.renamed`/`note.deleted` events from `workspaceAdapter`/`workspaceDocumentAdapter`
- ✅ Search UI backend wiring (debounced type-ahead and snippets) — `apps/desktop/src/search/SearchPanel.tsx` reads `useSearchIndexStore` status, debounces 300ms, queries via `searchService.search`, renders snippets
- ✅ Native command bridge and frontend types — `apps/desktop/src/native/commands.ts` types (`NativeDocumentInput`, `NativeSearchHit`) and `invokeNativeCommand` wrappers for `index_documents`/`search_index`/`clear_index`/`remove_index_document`
- ✅ Structured frontmatter records and facet queries (D41) — `apps/desktop/src-tauri/src/commands/search/metadata.rs` (companion `document_metadata` table, path-scoped facet/metadata-filter queries with per-document AND semantics per D43); `packages/core/src/markdown.ts` (`collectIndexMetadata`); `apps/desktop/src/native/commands.ts` (`query_index_metadata` bridge); `apps/desktop/src/search/searchIndexStore.ts` (`queryMetadata` with typed available/unavailable/failure results)
- ✅ File watcher for external edits (OI-003) — `apps/desktop/src-tauri/src/commands/watcher.rs` (native `notify` watcher, debounced, self-write suppression) and `apps/desktop/src/workspace/workspaceWatcher.ts` (translates changes into `note.*` events); started per workspace from `DesktopShell`
- 🟨 Connection pooling / managed SQLite state (OI-004) — pooling done in `search.rs` (`get_search_connection`); pool eviction on workspace close still open — `pending-connection_pooling-low-med.md`
