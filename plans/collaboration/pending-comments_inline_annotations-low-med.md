# Comments / Inline Annotations

## Goal

Allow collaborators to leave comments / inline annotations tied to specific
spans of a note's content, visible to other session participants.

## Acceptance Criteria

- [ ] Comments anchor to a text span and remain stable across minor edits.
- [ ] Comments are visible to all collaborators in the session.
- [ ] Comments are ephemeral session state (or stored in app-data), never
      written into the Markdown file unless the user explicitly exports them.
- [ ] Comments do not alter the Markdown document content for single-user mode.
- [ ] Tests cover anchor stability across concurrent edits.

## References

- `apps/desktop/src/editor/` — CodeMirror 6 editor decorations
- `plans/wip-collaboration-low-hard.md` — comments / inline annotations
