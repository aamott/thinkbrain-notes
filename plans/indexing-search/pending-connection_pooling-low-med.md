# Connection Pooling — Open Item OI-004

**Status: mostly done. Low urgency — revisit only if concurrency or perf becomes an issue.**

`SEARCH_CONNECTIONS` in `apps/desktop/src-tauri/src/commands/search.rs` holds a per-workspace connection pool. Every index command draws from it; `init_index_schema` runs once per workspace open; connections are created lazily. The pool is never emptied, so every workspace opened in a session keeps its handle until app exit.

**Remaining:** close/remove a connection when its workspace is closed or switched. Verify no regressions in index/search/remove/clear behavior.
