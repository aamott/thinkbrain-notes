# Non-Markdown File Operations

## Goal

Let users open, rename, and delete non-Markdown files (images, audio, video,
code files, config files, etc.) from the explorer tree, not just Markdown
notes.

## Status of the checkboxes

Generic open/rename/delete shipped: `onFileSelected` + `inferTabKind` route
text/code to the CodeMirror `code-editor` tab and media to the image/audio/
video viewers (`plans/ui-shell/done-summary.md`); rename/delete use the
generic `rename_workspace_entry` / `delete_workspace_entry` commands.

**Still open:** unsupported binary formats (`.pdf`, `.docx`, …) have no
in-app viewer and no OS-default-app fallback — needs `tauri-plugin-opener`
(`shell.open`) routed through `src/native/`, same dependency as
`workspace-manager/reveal_workspace_folder`.

## Acceptance Criteria

- [x] Clicking a non-Markdown file in the tree opens it in the appropriate
      in-app viewer:
      - **Text/code** (`.ts`, `.json`, `.yaml`, `.rs`, …) → CodeMirror tab.
      - **Images** (`.png`, `.jpg`, `.gif`, `.svg`, `.webp`) → image viewer.
      - **Audio** (`.mp3`, `.ogg`, `.wav`, `.flac`) → audio player tab.
      - **Video** (`.mp4`, `.webm`, `.mov`) → video player tab.
- [ ] **Unsupported binary formats** (`.pdf`, `.docx`, etc.) → open with OS
      default app via Tauri `opener` / `shell.open`.
- [x] Non-Markdown files show Rename and Delete actions in the context menu.
- [x] Rename updates the entry on disk and refreshes the tree.
- [x] Delete removes the file (with confirmation) and refreshes the tree.
- [x] Generic operations do not affect the search index (only Markdown is
      indexed); index sync is skipped for non-Markdown mutations.
- [x] Errors fail loudly with clear messages.

## Architecture Notes

- File type categorization lives in `packages/core` (`inferTabKind`) so
  mobile reuses it.
- The watcher needs no widening: it already watches the whole vault
  recursively and classifies events into `Audience::Notes` (Markdown →
  `note.*` events + search index) and `Audience::Everything`.
- Non-Markdown text I/O uses `read_text_file` / `write_text_file`;
  `read_markdown_file` stays Markdown-gated.
