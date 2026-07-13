# New Folder Action

## Goal

Let users create a new folder from the explorer. Currently the explorer only
creates Markdown files; there is no way to create an empty folder without
creating a file inside it.

## Acceptance Criteria

- [ ] A "New Folder" action is available in the explorer header (alongside
      the existing "New Note" action).
- [ ] Prompting for a folder path supports nested paths (e.g. `a/b/c`),
      creating intermediate directories as needed.
- [ ] The tree refreshes to show the new folder, including empty folders.
- [ ] Errors fail loudly with clear messages.

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
