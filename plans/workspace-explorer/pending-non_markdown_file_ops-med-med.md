# Non-Markdown File Operations

## Goal

Let users open, rename, and delete non-Markdown files (images, audio, video,
code files, config files, etc.) from the explorer tree, not just Markdown
notes. Currently non-Markdown files are listed but unclickable — no actions
are offered.

## Acceptance Criteria

- [ ] Clicking a non-Markdown file in the tree opens it in the appropriate
      in-app viewer (see `ui-shell/pending-generic_file_viewers-med-med.md`):
      - **Text/code files** (`.ts`, `.js`, `.json`, `.yaml`, `.css`, `.html`,
        `.py`, `.rs`, `.toml`, etc.) → CodeMirror tab (read/write).
      - **Images** (`.png`, `.jpg`, `.gif`, `.svg`, `.webp`) → image viewer tab.
      - **Audio** (`.mp3`, `.ogg`, `.wav`, `.flac`) → audio player tab.
      - **Video** (`.mp4`, `.webm`, `.mov`) → video player tab.
      - **Unsupported binary formats** (`.pdf`, `.docx`, etc.) → open with OS
        default app via Tauri `opener` / `shell.open`.
- [ ] Non-Markdown files show Rename and Delete actions in the context menu.
- [ ] Rename updates the entry on disk and refreshes the tree.
- [ ] Delete removes the file (with confirmation) and refreshes the tree.
- [ ] Generic operations do not affect the search index (only Markdown is
      indexed); index sync is skipped for non-Markdown mutations.
- [ ] Errors fail loudly with clear messages.

## Architecture Notes

- File type categorization lives in `packages/core` so mobile can reuse it.
- The `WorkspaceExplorer` callback changes from `onMarkdownFileSelected` to
  a generic `onFileSelected` that carries the file path and inferred type.
- The shell routes the file to the correct tab kind based on extension.

## File References

- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — click handler is gated
  on `isMarkdownFile`; needs to allow all files and pass extension info.
- `apps/desktop/src/shell/DesktopShell.tsx` — `openMarkdownDocument` becomes
  a generic `openWorkspaceDocument` with tab-kind routing.
- `apps/desktop/src/native/commands.ts` — may need a `read_workspace_file`
  command for reading non-Markdown text files (the existing
  `read_markdown_file` validates `.md` extension).
- `apps/desktop/src-tauri/src/commands/markdown.rs` — add a generic
  `read_workspace_file` / `write_workspace_file` alongside the existing
  Markdown-specific commands. The gate is `resolve_markdown_file_path` →
  `is_markdown_path`; the generic commands skip that check and reuse
  `resolve_workspace_entry_path` for containment. Create/rename/delete in
  `workspace.rs` already accept any extension.

## Dependencies

- `ui-shell/pending-generic_file_viewers-med-med.md` must ship the viewer
  components before files can be opened in-app. Only the `code-editor` piece is
  required for text/code editing; the media viewers (`image-viewer`,
  `audio-viewer`, `video-viewer`) are separable and can be deferred.

## What the file watcher already does (verified 2026-08-17)

The watcher needs no widening. It already watches the entire vault via the OS's
native event system (`notify` — `inotify` on Linux, `FSEvents` on macOS,
`ReadDirectoryChangesW` on Windows), recursively, in
`commands/watcher/lifecycle.rs`. It is not polling, and it is not markdown-only
on the watching side — the OS hands it events for every file in the vault
regardless of extension.

Classification is already split into two audiences in
`commands/watcher/classify.rs`:

- `Audience::Notes` — filters to `is_markdown_path`; feeds the `note.*` event
  channel and the search index.
- `Audience::Everything` — accepts any non-ignored, non-junk file; already
  consumed by Auto Sync via the `Changes.all` list.

`IGNORED_FOLDERS` (`node_modules`, `target`, `dist`, `vendor`) and dotfiles are
already excluded by `is_ignored_entry_name` inside `is_in_watched_area`, so a
vault holding a checked-out repo is already handled. No new ignore policy is
needed.

## The one watcher-adjacent decision: event vocabulary

The `note.*` event channel is a public contract extensions consume, and a `.ts`
file is not a note. Rather than widen `note.*` semantics, emit a parallel
`file.*` channel for non-Markdown text files. The `Changes.all` list already
exists in `collect_changes`; it just needs its own event alongside `note.*`,
keeping the existing channel's semantics intact for current consumers. This is
~30 lines of Rust plus a frontend listener.

## What carries over unchanged

`subscribeToNoteChanges`, `planDocumentSync`, `applyReloadedDocument`,
`moveDocumentView` and the tab `retarget` action are all indifferent to
extension. Only `reloadDocumentInPlace`'s read is Markdown-gated, through
`read_markdown_file` — which this story already plans to replace with
`read_workspace_file`.
