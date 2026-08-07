# New Folder Action

## Goal

Let users create a new folder from the explorer. Currently the explorer only
creates Markdown files; there is no way to create an empty folder without
creating a file inside it.

## Acceptance Criteria

- [x] A "New Folder" action is available in the explorer header (alongside
      the existing "New Note" action).
- [x] Prompting for a folder path supports nested paths (e.g. `a/b/c`),
      creating intermediate directories as needed.
- [x] The tree refreshes to show the new folder, including empty folders.
- [x] Errors fail loudly with clear messages.

## File References

- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — implemented
  `submitCreate`/context-menu handling for folders.
- `apps/desktop/src/workspace/workspaceAdapter.ts` — implemented
  `createWorkspaceFolder`.
- `apps/desktop/src/native/commands.ts` — implemented
  `create_workspace_folder` command entry.
- `apps/desktop/src-tauri/src/commands/workspace.rs` — implemented native
  command using `fs::create_dir_all`.

## Implementation Notes

The backend (`create_workspace_folder` Rust command, native command map entry,
and `WorkspaceDesktopApi.createWorkspaceFolder` adapter method) already existed
prior to this change — it uses `fs::create_dir_all` which creates intermediate
directories and is invoked from the explorer's context menu.

This change surfaces the action in the new header "..." (more actions) dropdown
alongside "New file" and the "Show hidden files" toggle. The existing
`InlineNameInput` + `submitCreate` flow handles `kind: "folder"` and calls
`apiRef.current.createWorkspaceFolder`. `submitCreate` was updated to accept
forward-slash-separated nested paths (e.g. `a/b/c`) for folders via a new
`isValidFolderPath` validator, while files still reject path separators.
`list_workspace_entries` already returns directories (including empty ones), so
the tree refresh after creation shows the new folder without extra work.
