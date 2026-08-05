# SQLite FTS5 Search Backend

## Goal

Provide a robust, instant full-text search across all notes in the vault, scaling to thousands of documents without relying on slow JavaScript array filtering.

## Design

- Use SQLite's FTS5 (Full-Text Search) extension on the native Rust side.
- When notes are parsed, index their plain text content into an FTS virtual table.
- Provide a `search_notes` Tauri command that takes a query string and returns matching note paths with snippets and highlighted terms.
- The Command Palette and Search sidebar panel use this native command instead of filtering the `visiblePaths` array in JS.

## Acceptance Criteria

- [ ] SQLite database is configured with an FTS5 virtual table.
- [ ] Note text content is synced to the FTS table on save.
- [ ] `search_notes` Tauri command implemented and exposed to the frontend.
- [ ] Command Palette queries the native search instead of local JS filtering.
- [ ] (Future) Search sidebar panel uses native search to show results with context snippets.
