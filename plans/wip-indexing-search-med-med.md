# Indexing and Search

Fast full-text search over local Markdown workspaces using a disposable SQLite
FTS5 cache. Markdown files on disk are the source of truth; the index is always
rebuildable and lives in OS app-data, never in the vault.

## Scope

- Background workspace indexing on open (batched, abortable, non-blocking).
- Incremental index upsert/remove on in-app create, save, rename, delete.
- Full-text search across filename, title, tags, aliases, and body text, scoped
  to the whole workspace or to one folder.
- Structured frontmatter indexing and facet queries for feature-owned filters (D41).
- Search UI panel with debounced type-ahead and result snippets.

## Architecture Decisions

- **SQLite FTS5 as an ephemeral cache.** One `documents_fts` virtual table;
  `path` stored unindexed so results resolve to a workspace-relative file.
  Per-workspace SQLite files named from a stable FNV-1a hash of the
  canonicalized root, so vaults never collide.
- **One platform-owned derived metadata cache (D41).** Structured frontmatter
  and facet values extend the rebuildable index; features do not maintain
  parallel caches or treat indexed metadata as source of truth.
- **Frontend-driven indexing (OI-005).** The frontend reads files, runs the
  core `parseNote`, and sends records to native SQLite via Tauri commands —
  reuses the tested parser and yields between batches. Deliberate; do not
  create a story for it.
- **The watcher reports, the frontend indexes (OI-003).** The native `notify`
  watcher detects external edits and reports paths only; the frontend
  republishes them as the same `note.*` events an in-app edit produces. App
  writes record an expected echo so the watcher doesn't re-report them.
- **A folder scope is part of the query, never a filter on its results.** Both
  `search_index` and `query_index_metadata` take a `pathPrefix` applied in SQL
  via the shared `path_prefix_sql` so the two cannot drift.
- **Facet values describe the matching set, not the folder.** A caller offering
  values to choose between asks twice — once predicate-free for the
  vocabulary, once with predicates for the matching set.
- **Pooled connections, never evicted (OI-004).** Index commands share a
  per-workspace `rusqlite::Connection` from `SEARCH_CONNECTIONS`; nothing
  removes a handle on workspace close — see `connection_pooling`.

## Reusable pieces

- `apps/desktop/src/lib/listWindow.ts` — pure virtualization math (row heights
  + scroll position → visible indices). The explorer tree, search results and
  outline panel render every row today and have the same problem.
- Per-workspace, per-view collapsed groups in desktop state (schema 5, D53),
  keyed by view id so the explorer tree can take the same row.

## Known limits

- `search_index` returns 50 hits by default, 200 max — fine for type-ahead,
  silently wrong for a caller using search as a filter. Raising it wants a
  paths-only query without per-hit snippets.
- Watcher is not verified on Windows (CI is `ubuntu-latest` only); rename
  shapes are handled but portable-by-construction.
- A symlinked folder inside the vault is reported twice — a redundant reindex,
  not a missed change.
- An in-app folder delete/rename rebuilds the index (the OS names only the
  folder). Also fixes stale entries for notes inside deleted folders.
- An outside write inside our debounce window is missed until that note
  changes again — genuinely indistinguishable; see `watcher.rs` module docs.

## Status

Shipped stories are summarized in `plans/indexing-search/done-summary.md`.

- ✅ native FTS5 index, per-workspace cache, frontend indexing service,
  background indexer, incremental upserts, search UI wiring, native bridge
- ✅ `fts5_search_backend` — folder-scoped search shared across surfaces
- ✅ frontmatter metadata facets (D41/D43)
- ✅ conflict-safe note writes (`expected` precondition)
- ✅ file watcher for external edits (OI-003)
- 🟨 `connection_pooling` — pooling shipped; pool eviction on workspace close
  still open (OI-004)
