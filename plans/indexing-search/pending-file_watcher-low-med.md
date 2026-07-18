# File Watcher for External Edits

## Goal

Detect changes to workspace Markdown files made outside the app (editor, sync
client, Git checkout) and update the search index incrementally so users do not
need to reopen the workspace to see external edits.

Today the index rebuilds fully on workspace open and updates only on in-app
create/save/rename/delete. A file watcher closes that gap.

Tracks open item OI-003. Matches the deferred file-watching plan in
`plans/wip-indexing-search-med-med.md`.

## Acceptance Criteria

- [ ] Workspace file changes (create, modify, delete, rename) made externally
      are reflected in the search index without reopening the workspace.
- [ ] Watcher debounces rapid event bursts (e.g. sync clients writing many
      files at once).
- [ ] App cache directories and dot-prefixed/hidden temp files are ignored.
- [ ] `.md` files are processed first; whitelisted attachment types only if
      needed for search.
- [ ] Indexing from the watcher never blocks the editor.
- [ ] Watcher is torn down cleanly on workspace close/switch (no leaked handles
      or stale events across workspaces).
- [ ] Works on the desktop target's supported OSes.

## References

- `apps/desktop/src-tauri/src/lib.rs` — native index commands, `open_index_connection`
- `apps/desktop/src/search/searchService.ts` — `indexWorkspace`, `indexDocument`, `removeIndexedDocument`
- `apps/desktop/src/search/useWorkspaceIndexer.ts` — open-time rebuild hook
- `plans/wip-indexing-search-med-med.md` — file-watching requirements
