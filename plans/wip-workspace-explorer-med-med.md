# Workspace Explorer

> The prior desktop explorer was removed with the retired UI. Rebuild the
> essential folder-open and read-only tree flow in the fresh shell before the
> follow-up file-manager stories below.

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
  `plans/extensions/pending-ipc_surface_is_not_the_contract-med-easy.md` for
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
- **Tree stays virtualized.** react-arborist is already in use; drag-and-drop
  should use its built-in DnD (currently disabled via `disableDrag`/
  `disableDrop`) rather than a separate DnD library.
- **Search/index ownership stays in indexing-search.** That epic owns the FTS5
  backend, index lifecycle, and index updates. Explorer stories only consume
  watcher/index events to refresh tree or editor UI; they do not add a second
  watcher or FTS5 backend.

## Status

- ✅ fresh-shell workspace open, restore, and read-only explorer
- ✅ Markdown CRUD UI integration in the fresh shell
- ✅ Full-vault tree integration (folders + non-Markdown files, read-only) —
  rebuilt against `list_workspace_entries` in the fresh shell
- ✅ Dot-prefixed entries hidden by default — `lib.rs` `is_hidden_name`
- ✅ Explorer icons, workspace selector, and multi-window workspace sessions
- ⬜ Non-Markdown file operations (open / rename / delete) — see
  `pending-non_markdown_file_ops-med-med.md`
- ⬜ Drag-and-drop move in the file tree — see
  `pending-drag_and_drop_move-med-hard.md`
- ✅ New-folder action
- ✅ Show-hidden toggle for dot-prefixed entries
- ⬜ Explorer tree/editor consumption of external file-change events — see
  `pending-file_watcher-med-hard.md`; watcher lifecycle and index updates belong
  to `plans/wip-indexing-search-med-med.md`.
- FTS5 backend/index lifecycle is owned by indexing-search — see
  `plans/wip-indexing-search-med-med.md`; retain
  `pending-fts5_search_backend-low-hard.md` as the explorer/UI integration note
  only.
