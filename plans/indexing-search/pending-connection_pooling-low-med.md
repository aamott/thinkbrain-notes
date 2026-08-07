# Connection Pooling / Managed SQLite State

## Goal

Replace the per-command `rusqlite::Connection` open with managed, shared SQLite
state (a connection pool or a single managed connection held in Tauri app
state) so index commands reuse a connection instead of opening and schema-init
on every call.

Today each `index_documents`, `search_index`, `clear_index`, and
`remove_index_document` command calls `open_index_connection`, which opens the
SQLite file and runs `init_index_schema` every time. This is fine for
single-user sequential use but adds repeated open/schema-check overhead and
prevents any future concurrency.

Tracks open item OI-004. Low urgency — revisit only if concurrency or perf
becomes an issue.

## Acceptance Criteria

- [ ] A managed SQLite connection (or pool) per workspace is held in Tauri app
      state and reused across index commands.
- [ ] `init_index_schema` runs once per workspace open, not per command.
- [ ] Connection is created lazily on first index/search call for a workspace.
- [ ] Connection is closed/removed when its workspace is closed or switched.
- [ ] Existing index/search/remove/clear behavior is unchanged.
- [ ] No regressions in indexing or search tests.

## References

- `apps/desktop/src-tauri/src/commands/search.rs` — `open_index_connection`,
  `init_index_schema`, and index command handlers
- `apps/desktop/src/native/commands.ts` — frontend native command map and types
