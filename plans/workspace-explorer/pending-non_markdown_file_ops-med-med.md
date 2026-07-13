# Non-Markdown File Operations

## Goal

Let users open, rename, and delete non-Markdown files (images, PDFs, config
files, etc.) from the explorer tree, not just Markdown notes. Currently
non-Markdown files are listed but read-only — no actions are offered.

## Acceptance Criteria

- [ ] Non-Markdown files show Rename and Delete actions in the tree row.
- [ ] Rename updates the entry on disk and refreshes the tree.
- [ ] Delete removes the file (with confirmation) and refreshes the tree.
- [ ] "Open" for non-Markdown files opens them with the OS default app
      (Tauri `opener` / `shell.open`) — they are not loaded into the editor.
- [ ] Generic operations do not affect the search index (only Markdown is
      indexed); index sync is skipped for non-Markdown mutations.
- [ ] Errors fail loudly with clear messages.

## File References

- `apps/desktop/src/workspace/FileTree.tsx` — row renderer gates actions on
  `markdownFile` (line ~93); needs to offer actions for non-Markdown files.
- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — handlers are
  Markdown-specific (`handleRenameNote`, `handleDeleteNote`); add generic
  equivalents.
- `apps/desktop/src/workspace/workspaceService.ts` — add generic
  rename/delete/open helpers.
- `apps/desktop/src/native/commands.ts` — add new native command entries
  (e.g. `rename_workspace_entry`, `delete_workspace_entry`,
  `open_workspace_entry`).
- `apps/desktop/src-tauri/src/lib.rs` — add Rust commands for generic
  rename/delete/open; existing `rename_markdown_file` (line 243) and
  `delete_markdown_file` (line 288) are Markdown-only.
