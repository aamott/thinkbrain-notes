# Drag a file into a Markdown editor → insert a link at the drop point

Dragging a file (or folder) row from the workspace explorer onto an open
Markdown editor inserts a link to that file at the caret position under the
pointer — `[File Name](path/to/file.md)` for notes, the appropriate wiki-/path
form for other types.

## Shape

- The tree's native drag (`useWorkspaceFileDrag`, desktop) writes an
  `application/x-thinkbrain-tree` dataTransfer entry carrying the
  workspace-relative path; the editor reads it on `drop` and becomes a
  second drop target. Drop position maps to a document offset, and the
  insert goes through the editor's normal change path so undo/redo, dirty
  state, and live preview behave as usual.
- Link text: the file's display name (stem without `.md`); target: the
  workspace-relative path. Non-markdown files link by relative path as well.
- Folders: link to the folder path (resolution of folder links is a separate
  question — out of scope here).
- Modifier/`Alt`-drop could offer "copy file into vault" or "embed" later —
  out of scope.

## Open questions

- How the editor maps client coordinates to a document offset
  (`caretRangeFromPoint` vs the editor's own pos-at-coords API, depending on
  what `MarkdownEditor` is built on).
- Whether non-note files embed instead of link (e.g. `![[image.png]]`) — that
  is a note-model/epic decision; default to a plain link.
