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

- [ ] Headings render at appropriate visual sizes when cursor is elsewhere.
- [ ] Bold, italic, strikethrough render visually on unfocused lines.
- [ ] Wiki links `[[Target]]` render as styled link text.
- [ ] Task checkboxes render as interactive checkboxes.
- [ ] Cursor entering a line reveals full markdown source for that line.
- [ ] Multi-line selections show source for all selected lines.
- [ ] No data loss — the underlying document is always raw markdown.

## Dependencies

- Existing `MarkdownEditor.tsx` and CodeMirror 6 setup.
