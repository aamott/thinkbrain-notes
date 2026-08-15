# Indexing & Search Epic — Completed Work

Two stories shipped: conflict-safe note writes and frontmatter metadata facets.

## Conflict-Safe Note Writes
`write_markdown_file` takes an optional `expected` precondition and rejects mismatches with `workspace.note_conflict` instead of blind-overwriting. The shell tracks each tab's disk text in `DocumentViewState.diskContents` and sends it on every save. On conflict, the buffer is untouched and the `StaleDocumentBanner` surfaces (not an error toast).

Key decisions:
- `expected: None` means unchecked (not "expected no file") — opt-in, so extension/scripted writes still work.
- `expected: string | undefined` is required-present, allowed-absent — dropping it is a compile error, not a silent blind write.
- Read/check/write under `WORKSPACE_ENTRY_MUTATION_LOCK`.
- "Keep mine" re-anchors by re-reading the file, so the next save isn't refused against the version the user just declined.
- A tab that was never read cannot be saved (`saveablePrecondition` returns null).

Non-goal: side-by-side merge — deferred to `git-integration/pending-inline_diff_viewer-high-med.md`.
- `apps/desktop/src-tauri/src/commands/markdown.rs` — `write_markdown_file` with `expected`
- `apps/desktop/src/shell/DesktopShell.tsx` — `saveDocument`, `keepMyVersion`

## Frontmatter Metadata Facets
Index records now carry arbitrary parsed frontmatter keys and scalar/list values. Typed facet and metadata-filter queries accept workspace root, path prefix, and field keys/values; all predicates AND against one document record (D43). List values flatten into distinct facet values; strings/numbers round-trip without product meaning. Rebuild and incremental create/save/rename/delete stay consistent with the search index lifecycle. Malformed frontmatter never breaks document indexing. Schema changes are safe for existing disposable databases; a rebuild fully restores from Markdown.

Decision constraint: D41 — platform-owned disposable index, no journal-owned cache, no source-file scans on facet requests.
- `apps/desktop/src-tauri/src/commands/search.rs` — disposable schema, upsert, facet query
- `apps/desktop/src/native/commands.ts` — typed record and facet-query bridge
- `packages/core/src/note-model.ts` — parsed frontmatter in index record
