# Backlinks Panel

## Goal

Show a list of notes that link to the currently active note via `[[Target]]`
wiki links, in a dedicated panel. This is the user-facing counterpart to the
wiki-link index: for the active note, find every other note whose
`wikiLinks` resolve to it.

Depends on link target resolution (`pending-link_target_resolution`).

## Acceptance Criteria

- [ ] A backlinks panel renders in the desktop app, listing notes that link to
      the active note.
- [ ] Each entry shows the linking note's title and the link context (surrounding
      line or display text); clicking navigates to the linking note.
- [ ] Backlinks update when the active note changes and when the index updates
      (file save / reindex).
- [ ] Empty state is shown when no notes link to the active note.
- [ ] Unresolved links pointing at the active note's title/alias are still
      counted (so renaming a note to match a dangling link surfaces it).
- [ ] Panel uses CSS Modules; no inline styles.
- [ ] Vitest covers the backlink lookup logic in `packages/core`; the desktop
      service wrapper is tested too.

## References

- `packages/core/src/note-model.ts` — `WikiLink`, `NoteMetadata`
- `packages/core/src/markdown.ts` — `extractWikiLinks`
- `apps/desktop/src/search/searchService.ts` — existing index access pattern
- `plans/pending-graph-low-hard.md` — this epic
- `plans/graph/pending-link_target_resolution-low-med.md` — prerequisite
