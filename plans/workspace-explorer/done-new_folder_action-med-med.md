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

- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — add a
  `handleCreateFolder` handler and a header button; `handleCreateNote`
  (line 87) is the pattern to follow.
- `apps/desktop/src/workspace/workspaceService.ts` — add a
  `createFolder` helper.
- `apps/desktop/src/native/commands.ts` — add a `create_workspace_folder`
  command entry.
- `apps/desktop/src-tauri/src/lib.rs` — add a Rust command using
  `fs::create_dir_all`; existing `create_markdown_file` (line ~210) is the
  pattern for path normalization.

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
