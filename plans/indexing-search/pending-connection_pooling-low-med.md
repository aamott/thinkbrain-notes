# Connection Pooling / Managed SQLite State

## Goal

Replace the per-command `rusqlite::Connection` open with managed, shared SQLite
state (a connection pool or a single managed connection held in Tauri app
state) so index commands reuse a connection instead of opening and schema-init
on every call.

Most of this is already done. `get_search_connection` in
`apps/desktop/src-tauri/src/commands/search.rs` holds a per-workspace pool
(`SEARCH_CONNECTIONS`) and every index command draws from it, so the SQLite file
is opened and schema-checked once per workspace rather than once per call.

What remains is the other end of the lifecycle: nothing ever removes a
connection from the pool, so every workspace opened in a session keeps its
handle until the app exits.

Tracks open item OI-004. Low urgency — revisit only if concurrency or perf
becomes an issue.

## Acceptance Criteria

- [x] A managed SQLite connection (or pool) per workspace is held in Tauri app
      state and reused across index commands.
- [x] `init_index_schema` runs once per workspace open, not per command.
- [x] Connection is created lazily on first index/search call for a workspace.
- [ ] Connection is closed/removed when its workspace is closed or switched.
- [ ] Existing index/search/remove/clear behavior is unchanged.
- [ ] No regressions in indexing or search tests.

## References

- `apps/desktop/src-tauri/src/commands/search.rs` — `open_index_connection`,
  `init_index_schema`, and index command handlers
- `apps/desktop/src/native/commands.ts` — frontend native command map and types
