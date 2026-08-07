# Drag-and-Drop Move

## Goal

Allow users to move files and folders by dragging them to a new parent folder
in the explorer tree. Currently drag and drop are explicitly disabled
(`disableDrag` / `disableDrop` on the react-arborist `Tree`).

## Acceptance Criteria

- [ ] Dragging a file onto a folder moves it into that folder.
- [ ] Dragging a folder onto another folder moves it (recursively) inside.
- [ ] Dropping onto the tree root moves an item to the workspace root.
- [ ] Moving a Markdown file updates the search index (remove old path, index
      new path).
- [ ] Moving a folder updates the index for all Markdown files within it.
- [ ] Moves that would overwrite an existing file are rejected with a clear
      error (no silent overwrite).
- [ ] A move that would drop a folder into its own descendant is rejected
      (cycle guard).
- [ ] The tree refreshes to reflect the new structure after a move.

## File References

- `apps/desktop/src/workspace/FileTree.tsx` — `disableDrag` / `disableDrop`
  (lines 36-37) must be removed; wire `onMove`/`onDrop` handlers.
- `apps/desktop/src/workspace/fileTreeModel.ts` — tree model may need to
  expose move semantics or be rebuilt after a move.
- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — add a `handleMove`
  handler that calls the native move and refreshes entries.
- `apps/desktop/src/workspace/workspaceAdapter.ts` — extend the existing
  `renameWorkspaceEntry` adapter for the move flow.
- `apps/desktop/src/native/commands.ts` — use the existing
  `rename_workspace_entry` command (a separate move command is unnecessary).
- `apps/desktop/src-tauri/src/commands/workspace.rs` — extend the existing
  rename command as needed for recursive folder moves and overwrite/cycle
  guards.
- `apps/desktop/src-tauri/src/commands/search.rs` — indexing-search owns
  remove/upsert operations for moved Markdown files; the explorer only invokes
  the shared bridge after the move.
