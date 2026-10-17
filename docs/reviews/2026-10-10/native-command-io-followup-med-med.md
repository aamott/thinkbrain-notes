# Native command I/O follow-up

Revalidated against `main` at `054406b3`. This is a source-path audit, not a
measured latency benchmark. Scope is the registered command surface in
`apps/desktop/src-tauri/src/commands/mod.rs` and its filesystem, SQLite, sync,
dialog, and lifecycle callees.

## Corrections to the original audit

- `sync_now` is no longer a registered command or implementation. Sync network
  work runs in `sync/registry.rs::start_round_inner` on a named thread.
  Git import similarly starts `thinkbrain-import`; sign-in setup delegates to
  the existing background round. Their synchronous preparation still includes
  settings/catalog/keychain access.
- Some commands are already async: workspace-window creation and picked-file
  dialogs. Async alone does not make blocking code nonblocking: the picked-file
  commands still call blocking dialog and file APIs on the async runtime.

## Priorities and boundaries

| Area | Current work on the command path | Decision |
|---|---|---|
| `open_workspace`, `list_workspace_entries` | Recursive Markdown/tree scans and metadata reads | First fix implemented: owned inputs, async command, blocking worker; validate paths inside the worker. |
| `read_media_file` | Bounded whole-file read, up to the existing 256 MiB cap | First fix implemented: existing contained/capped read runs in a blocking worker; raw IPC bytes preserved. |
| Search command family | SQLite open/schema, transactions/FTS optimize, queries, and connection-mutex waits | Next focused change: treat reads/writes and synchronous rename/delete index cleanup together. |
| History/conflict/maintenance | History walks/diffs, filesystem comparisons/restores, object traversal/cleanup, engine/lane locks | Separate lifecycle-aware follow-up; do not retain a stale engine across a yield. |
| Markdown/text/backup and workspace CRUD | Reads, atomic writes, backups, recursive rename/delete, mutation locks | Still synchronous; assess together with search cleanup before parallelizing mutation paths. |
| Settings/themes/extensions/known workspaces/sign-in | File reads/writes, theme enumeration/seeding, bounded extension reads, path probes, catalog/keychain access | Lower-priority I/O remains; preserve document preconditions, lock ordering, and platform behavior. |
| Watcher and app backgrounding | OS watcher registration/release and last-chance settled-note recording; bootstrap/network work already threaded | Keep lifecycle ordering intact. Mobile suspension makes a blanket fire-and-forget conversion unsafe. |
| Capabilities/window-root/quarantine list/clipboard | State/capability answers and platform clipboard APIs | Do not blanket-convert these; platform-affine APIs need their own review. |

## First-fix invariants

- No root, path, connection, or engine is resolved before the worker yield and
  then trusted later. The read-only scan bodies keep their existing path
  validation, traversal limits, exclusions, sorting, and error codes.
- No new session/index/engine ownership is introduced. A dropped command future
  need not cancel a blocking read; it must not create persistent holdings.
- The renderer's existing root checks after awaits in `useWorkspaceSession`
  continue to reject results from a workspace the user has left.
- Worker join/panic failures become logged, typed native errors; ordinary
  domain errors pass through unchanged.

## Remaining action

Keep `async_io_commands` in progress after the first fix. Next audit/fix the
whole search lock surface, including `workspace_paths::remove_search_index_entry`
and managed-workspace deletion. A synchronous caller waiting on a worker-held
SQLite mutex can still block the main thread, and a late index open must not
recreate deleted metadata or repool a released workspace.
