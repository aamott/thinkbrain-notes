# Story: Frontmatter Metadata Facets

## Epic

Part of [Indexing and Search](../wip-indexing-search-med-med.md).

## Decision constraint

D41 chooses the platform-owned disposable index for structured frontmatter and metadata
facet queries. Do not build a journal-owned cache, defer D16's facets, or scan every file
when facets are requested. Indexed metadata remains derived state and never source of truth.

## Goal

Extend the existing index record and query API so feature-owned filters can enumerate
distinct frontmatter values and apply metadata predicates under a workspace-relative path
prefix without reading source files on demand.

## Scope

- Carry parsed frontmatter from the shared `parseNote` path into the existing index lifecycle.
- Store a queryable representation of arbitrary field keys and the scalar/list values needed
  by D4; do not hard-code journal field names or vocabularies.
- Add typed facet and metadata-filter queries scoped by workspace, path prefix and requested
  field keys/values so D16 search can operate within the filtered set.
- Flatten multi-select/list values into distinct facet values; preserve strings and numbers
  without assigning product meaning.
- Keep rebuild, upsert, rename/delete and clear behavior consistent with document search.
- Version or migrate the disposable schema safely; rebuilding from Markdown must always be
  sufficient.
- Return typed unavailable/failure results so consumers can degrade without source-file scans.

The storage shape is an implementation choice: an FTS column, companion table, or equivalent
is acceptable if it shares the platform index's lifecycle and disposal boundary.

## Likely files

- `packages/core/src/note-model.ts` and tests — expose parsed frontmatter in the index record
  without changing Markdown source-of-truth behavior.
- `apps/desktop/src/search/searchService.ts` and tests — pass structured frontmatter through
  rebuild and incremental upsert paths.
- `apps/desktop/src/native/commands.ts` — typed record and facet-query bridge.
- `apps/desktop/src-tauri/src/lib.rs` and focused Rust tests — disposable schema, upsert,
  clear/remove and path-scoped facet query.

## Dependencies

- Existing frontend-driven indexing and shared `parseNote` path (OI-005).
- Existing per-workspace disposable SQLite cache and native command bridge.
- D4 field value types and D41 ownership boundary.

## Acceptance criteria

- [ ] Index records carry arbitrary parsed frontmatter keys and supported scalar/list values;
      no journal-specific keys, mood scale or activity taxonomy are embedded.
- [ ] Facet and metadata-filter queries accept workspace root, workspace-relative path prefix
      and requested field keys/values; they return deterministic distinct values and matching
      document paths so D16 search can run within the filtered set.
- [ ] List values are flattened for multi-select facets; strings and numbers round-trip without
      product-specific interpretation.
- [ ] Rebuild and incremental create/save/rename/delete paths keep metadata facets consistent
      with the existing search index lifecycle.
- [ ] Malformed or unsupported frontmatter never breaks document indexing; typed diagnostics
      identify skipped metadata while ordinary search remains available.
- [ ] Schema changes are safe for existing disposable databases; a rebuild fully restores search
      and facet data from Markdown files.
- [ ] Index unavailable/failure is represented explicitly; no API falls back to reading every
      source file and no feature-owned cache is introduced.
- [ ] Tests cover path-prefix isolation, requested-key/value isolation, strings, numbers,
      lists, duplicate values, combined metadata filters, updates, deletes, rebuilds, malformed
      frontmatter and unavailable index.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and focused Rust tests pass.

## Non-goals

- No journal UI, filter-popover design, field-definition settings or calendar aggregation.
- No proprietary metadata source, note rewrite, journal database, file watcher or semantic index.
- No product meaning, colors, ordering or vocabulary attached to facet values.

## Handoff artifacts

Journal consumers need typed path-scoped facet/filter queries, deterministic distinct values,
matching document paths and an explicit unavailable result. `pending-journal_service_daily_notes-high-med.md` adapts that API;
`pending-journal_panel_ui-high-hard.md` owns the degraded UI state and D16 filter emphasis.
