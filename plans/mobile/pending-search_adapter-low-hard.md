# Mobile Search Adapter

## Goal

Implement the mobile `SearchAdapter` using `expo-sqlite` with an FTS5 cache,
following the same ephemeral-cache discipline as desktop: Markdown files on disk
are the source of truth, the index is always rebuildable, and cache files live
in OS app-data — never in the vault.

## Acceptance Criteria

- [ ] `SearchAdapter` implementation lives in `apps/mobile/src/adapters/`.
- [ ] Implements the `SearchAdapter` interface from `packages/core`.
- [ ] FTS5 index over filename, title, tags, aliases, and body text.
- [ ] Index upsert/remove on in-app create, save, rename, delete.
- [ ] Per-workspace cache file stored in mobile app-data, keyed by a stable
      workspace hash (mirroring desktop's approach).
- [ ] Full rebuild on workspace open; index is disposable and rebuildable.
- [ ] Search results resolve back to workspace-relative file paths.

## References

- `plans/wip-indexing-search-med-med.md` — desktop indexing architecture and FTS5 schema
- `apps/desktop/src-tauri/src/lib.rs` — `resolve_index_db_path`,
  `stable_workspace_hash` (reference implementation)
- `plans/technical-decisions.md` — Database and Indexes, Search sections
- `plans/pending-mobile-low-hard.md` — Platform adapter contract
