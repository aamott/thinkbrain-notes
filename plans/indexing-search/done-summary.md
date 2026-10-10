# Indexing & Search — Completed Work

## Conflict-Safe Note Writes

`write_markdown_file` takes an optional `expected` precondition and rejects
mismatches with `workspace.note_conflict` instead of blind-overwriting. The
shell tracks each tab's disk text in `DocumentViewState.diskContents` and
sends it on every save; on conflict the `StaleDocumentBanner` surfaces.

- `expected: None` means unchecked (opt-in) — extension/scripted writes still
  work.
- `expected` is required-present, allowed-absent on the TS side — dropping it
  is a compile error, not a silent blind write.
- Read/check/write under `WORKSPACE_ENTRY_MUTATION_LOCK`.
- "Keep mine" re-anchors by re-reading the file, so the next save isn't
  refused against the version the user declined.
- Non-goal: side-by-side merge — deferred to
  `git-integration/inline_diff_viewer`.

## Frontmatter Metadata Facets

Index records carry arbitrary parsed frontmatter keys and scalar/list values.
Typed facet and metadata-filter queries accept workspace root, path prefix,
and field keys/values; all predicates AND against one document record (D43).
Malformed frontmatter never breaks document indexing; a rebuild fully
restores from Markdown. Constraint: D41 — platform-owned disposable index,
no feature-owned parallel caches.
