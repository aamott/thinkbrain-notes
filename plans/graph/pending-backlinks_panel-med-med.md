# Backlinks Panel

## Goal

Show a list of notes that link to the currently active note via `[[Target]]`
wiki links, in a dedicated panel. This is the user-facing counterpart to the
wiki-link index: for the active note, find every other note whose
`wikiLinks` resolve to it.

Depends on link target resolution (shipped; see `plans/graph/done-summary.md`).

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
- `plans/wip-indexing-search-med-med.md` — indexing-search epic and index lifecycle
- `apps/desktop/src-tauri/src/commands/search.rs` — shipped native index backend
- A future typed frontend bridge remains planned for native index access; no bridge
  file is assigned yet.
- `plans/pending-graph-low-hard.md` — this epic
- `plans/graph/done-summary.md` — link target resolution, prerequisite (shipped)
