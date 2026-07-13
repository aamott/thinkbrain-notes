# Workspace Explorer

> Follow-up epic for the workspace + file explorer. The core explorer (folder
> open, Markdown CRUD, full-vault tree listing) shipped with work item 003.
> This epic tracks the remaining open items (OI-006) that make the explorer a
> complete file manager: generic file operations, drag-and-drop move,
> new-folder creation, and a show-hidden toggle.

## Goal

Extend the file explorer beyond Markdown-only editing so users can manage all
vault contents (attachments, config files, folders) without leaving the app.

## Scope

- Generic (non-Markdown) file operations: open, rename, delete
- Drag-and-drop move for files and folders in the tree
- New-folder action
- Show-hidden toggle for dot-prefixed entries (`.git`, `.obsidian`, …)

## Architecture Decisions

- **Generic file ops reuse the existing native bridge.** The current Rust
  commands are Markdown-specific (`create_markdown_file`,
  `rename_markdown_file`, `delete_markdown_file`). Generic operations should
  be added as new commands (e.g. `rename_workspace_entry`,
  `delete_workspace_entry`) that accept any path, keeping the Markdown-specific
  commands intact for the editor/index flows that depend on them.
- **Move = rename across directories.** A drag-and-drop move is a rename to a
  new relative path; no separate "move" command is needed. Folders must move
  recursively.
- **Show-hidden is a listing parameter, not a post-filter.** The
  `list_workspace_entries` command should accept an `includeHidden` flag so
  dot-prefixed entries are returned by the native layer rather than filtered
  client-side. This keeps the tree consistent with disk.
- **Show-hidden preference is workspace-scoped.** Persist the toggle in
  workspace settings (already stored outside the vault via
  `read_workspace_settings` / `write_workspace_settings`), not in global app
  settings.
- **Tree stays virtualized.** react-arborist is already in use; drag-and-drop
  should use its built-in DnD (currently disabled via `disableDrag`/
  `disableDrop`) rather than a separate DnD library.

## Status

- ✅ Open workspace folder + remember snapshot — `WorkspaceExplorer.tsx`,
  `workspaceService.ts`, `lib.rs` `open_workspace`
- ✅ Full-vault tree listing (folders + non-Markdown files, read-only) —
  `FileTree.tsx`, `fileTreeModel.ts`, `lib.rs` `list_workspace_entries` /
  `collect_workspace_entries`
- ✅ Markdown CRUD (create / rename / delete / read / write) —
  `workspaceService.ts`, `WorkspaceExplorer.tsx` handlers
- ✅ Dot-prefixed entries hidden by default — `lib.rs` `is_hidden_name`
- ⬜ Non-Markdown file operations (open / rename / delete) — see
  `pending-non_markdown_file_ops-med-med.md`
- ⬜ Drag-and-drop move in the file tree — see
  `pending-drag_and_drop_move-med-hard.md`
- ⬜ New-folder action — see `pending-new_folder_action-med-med.md`
- ⬜ Show-hidden toggle for dot-prefixed entries — see
  `pending-show_hidden_toggle-med-med.md`
