# Wiki-Link Autocomplete

## Goal

When the user types `[[` in the editor, show an autocomplete dropdown of note titles, filenames, and aliases that match the text typed so far. Selecting one inserts `[[Target]]` (or `[[Target|alias]]` when appropriate).

## Dependencies

- A note index source (filenames, titles, aliases) available to the editor at runtime. The search indexer already reads and parses all notes; this story needs that data exposed as a lightweight autocomplete source.
- Link target resolution (`pending-link_target_resolution-low-med.md`) — ✅ done (not required for autocomplete itself, but shared note-index infrastructure).

## Acceptance Criteria

- [ ] Typing `[[` triggers a CodeMirror autocomplete popup.
- [ ] As the user types more characters (`[[Proj`), the results filter to notes whose filename, title, or aliases match the typed text (case-insensitive, prefix or substring match).
- [ ] Each result shows a readable label (title if present, otherwise filename) and the note path as a detail.
- [ ] Selecting a result inserts `[[Target]]` where `Target` is the filename without extension (matching how links are typically written).
- [ ] Escape or clicking away dismisses the popup without inserting.
- [ ] The autocomplete source is efficient for large vaults (debounced or cached; does not re-parse all notes on every keystroke).
- [ ] Tests cover the source filtering and insertion behavior.

## References

- `apps/desktop/src/tabs/markdownEditorHooks.ts` — editor hook registry where the autocomplete extension would be registered
- `packages/core/src/note-model.ts` — `NoteMetadata` (title, aliases)
- `packages/core/src/linkResolver.ts` — `NoteIndexEntry` (the shape the autocomplete source needs)
- CodeMirror 6 `@codemirror/autocomplete` — `autocompletion` API
