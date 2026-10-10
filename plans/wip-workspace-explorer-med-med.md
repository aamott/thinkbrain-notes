# Workspace Explorer

## Goal

Extend the file explorer beyond Markdown-only editing so users can manage and
open all vault contents — text/code files, images, audio, video, attachments,
config files, and folders — without leaving the app. Supported file types open
in-app with dedicated viewers; unsupported binary formats fall back to the OS
default application.

## Scope

- Generic (non-Markdown) file operations: open, rename, delete
- Drag-and-drop move for files and folders in the tree
- New-folder action
- Show-hidden toggle for dot-prefixed entries (`.git`, `.obsidian`, …)

## Architecture Decisions

- **Generic file ops reuse the existing native bridge.** The Rust commands
  were Markdown-specific (`create_markdown_file`, `rename_markdown_file`,
  `delete_markdown_file`). Generic operations were added as new commands
  (`rename_workspace_entry`, `delete_workspace_entry`) that accept any path.

  This decision originally said to keep the Markdown-specific commands intact
  "for the editor/index flows that depend on them". Those flows moved to the
  generic commands, and on 2026-08-28 `rename_markdown_file` and
  `delete_markdown_file` were removed with no caller left anywhere — see
  `plans/extensions/done-summary.md` for
  why an unused Tauri command is safe to delete. `create_markdown_file`
  remains and is still used.
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
- **Tree stays virtualized.** Drag-and-drop shipped as a focused
  pointer/keyboard controller (`useWorkspaceTreeDrag`) over the existing
  virtualized tree — whole-row mouse/pen drag with a floating preview,
  hold-to-drag on touch, and a keyboard drive from the row handle; no DnD
  library was added. See `plans/workspace-explorer/done-summary.md`.
- **Search/index ownership stays in indexing-search.** That epic owns the FTS5
  backend, index lifecycle, and index updates. Explorer stories only consume
  watcher/index events to refresh tree or editor UI; they do not add a second
  watcher or FTS5 backend.

## Status

Shipped stories are summarized in `plans/workspace-explorer/done-summary.md`.

- ✅ fresh-shell workspace open/restore, read-only explorer, Markdown CRUD,
  full-vault tree, hidden-dotfile default, explorer icons, multi-window
  sessions, new-folder action, show-hidden toggle
- ✅ `drag_and_drop_move` — pointer/touch/keyboard move in the tree
- ✅ `default_markdown_extension` — protected `.md` prefill on new note
- ✅ file watcher consumption — tree/editor sync with external changes
- ✅ `fts5_search_backend` — explorer search surfaces on the shared FTS5 index
- 🟨 `non_markdown_file_ops` — generic open/rename/delete shipped; OS-default
  fallback for unsupported binaries still open
- ⬜ `drag_file_link_drop` — drop a tree file into a Markdown editor → link
- ⬜ `editing_prop_group` — group the explorer view's editing props
- ⬜ `tree_keyboard_consolidation` — one module owns the tree keyboard map
