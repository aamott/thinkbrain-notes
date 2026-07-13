# Note Cards on Canvas

## Goal

Render notes as cards on the canvas. A card references a Markdown note by
relative path and displays its content. Cards can be created, moved, resized,
and deleted. Cards may also hold standalone text/media without a backing note.

## Acceptance Criteria

- [ ] Creating a card from an existing note places it at the cursor/drop
      position with a default size.
- [ ] Card displays the referenced note's content (rendered Markdown,
      read-only initially).
- [ ] Cards can be moved by dragging and resized via handles.
- [ ] Cards can be deleted from the canvas (does not delete the backing note).
- [ ] Standalone text/media cards (no backing note) are supported.
- [ ] Double-clicking a note-backed card opens the note in the editor.
- [ ] Card selection (single and multi-select via rubber-band) works.
- [ ] Z-ordering: bring-to-front / send-to-back controls.

## References

- `apps/desktop/src/` — card component
- `packages/core/src/` — canvas document model (nodes)
- `packages/core/src/markdown.ts` — Markdown rendering source
