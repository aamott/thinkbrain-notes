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
- `apps/desktop/src-tauri/src/lib.rs` — add a generic `read_workspace_file`
  Rust command alongside the existing Markdown-specific one.

## Dependencies

- `ui-shell/pending-generic_file_viewers-med-med.md` must ship the viewer
  components before files can be opened in-app.
