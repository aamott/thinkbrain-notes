# Native File Watcher

## Goal

Consume the external file-change events owned by indexing-search so the explorer
and open editor stay synchronized (for example after a VS Code edit or `git
pull`). This story owns tree/editor UI response, not watcher lifecycle or index
maintenance.

## Design

- The indexing-search epic owns the Rust watcher, event production, debouncing,
  teardown, and search-index updates.
- The frontend `workspaceExplorerModel`/`WorkspaceExplorer` consumes those events
  and refreshes tree state without requiring a full reload.
- If an open editor tab represents a file changed externally, prompt the user to
  reload it (or auto-reload if unmodified).

## Acceptance Criteria

- [ ] Explorer tree updates automatically on file add/delete/rename events from
      the indexing-search watcher.
- [ ] Active editor tab reloads content if its file changes externally.
- [ ] Explorer ignores events for closed or superseded workspaces.
- [ ] No second watcher, debounce loop, or FTS5/index update path is introduced
      in this epic.
