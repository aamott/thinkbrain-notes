# Semi-Preview Markdown Editor (Live Preview)

## Goal

Replace the plain-text CodeMirror markdown editing experience with a
semi-preview mode where markdown formatting is rendered inline but reveals
source syntax when the cursor is on that line.

## Behavior

- **Cursor off a line**: Markdown is rendered visually. For example, `## Title`
  renders as a large bold heading showing only "Title". Bold, italic, links,
  code spans, lists, and checkboxes all render as formatted output.
- **Cursor on a line**: The full markdown source is shown, including syntax
  characters (`##`, `**`, `[[`, etc.), so the user can edit the raw markup.
- This is similar to Typora, Obsidian's live preview, or iA Writer's hybrid
  mode.

## Architecture Notes

- Implemented as CodeMirror 6 decorations and widgets. The editor remains a
  source editor internally — no AST round-tripping or separate preview DOM.
- Use CodeMirror's `Decoration.replace` to hide syntax characters on unfocused
  lines, and `ViewPlugin` + `StateField` to track which line has the cursor.
- Heading level determines font size via CSS classes on the line decoration.
- Links show as clickable text (Cmd/Ctrl+click to follow). Images show inline
  previews. Code blocks show with syntax highlighting.
- Must not interfere with undo/redo, selections spanning multiple lines, or
  collaborative editing (future).

## Acceptance Criteria

- [x] Headings render at appropriate visual sizes when cursor is elsewhere.
- [x] Bold, italic, strikethrough render visually on unfocused lines.
- [x] Wiki links `[[Target]]` render as styled link text.
- [x] Task checkboxes render as interactive checkboxes.
- [x] Cursor entering a construct reveals its markdown source. Reveal is
      per-node for inline markup and per-line for line-leading markers, which
      is a deliberate refinement of the original "per line" wording.
- [x] Multi-line selections show source for all overlapped constructs.
- [x] No data loss — the underlying document is always raw markdown.
- [x] Frontmatter renders as a styled data block instead of being mis-parsed
      as a setext heading.
- [x] `editor.livePreview` toggles the mode without losing cursor or history.
- [x] Arrow keys traverse replaced markers without stranding the cursor.

- [x] GFM tables render monospaced with an emphasised header; the
      `| --- | --- |` alignment row is concealed and drawn as a rule.

## Not Implemented

- **True table grid rendering.** Tables are aligned and styled, but not drawn
  as an HTML grid — that would mean replacing the source, which this editor
  deliberately never does. Cell pipes stay visible as the column cue.
- **Link navigation.** Clicking a link or `[[wiki link]]` does not open
  anything — resolving a target to a workspace file is separate work.

## Security Note

Vault-relative images are served over Tauri's `asset://` protocol. The static
scope in `tauri.conf.json` is **empty**; `open_workspace` grants read access to
the opened vault at runtime via `asset_protocol_scope().allow_directory`. The
renderer therefore reaches nothing until a workspace is deliberately opened,
and then only inside it — rather than the whole filesystem a `"**"` scope would
have allowed.

## Dependencies

- Existing `MarkdownEditor.tsx` and CodeMirror 6 setup.

## Implementation

- Spec: `docs/superpowers/specs/2026-08-06-markdown-live-preview-design.md`
- Plan: `docs/superpowers/plans/2026-08-06-markdown-live-preview.md`
- Code: `apps/desktop/src/tabs/livePreview/`
- Demo: `apps/desktop/demo/live-preview.html` (dev server only)
