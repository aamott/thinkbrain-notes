# Incremental Re-Embedding

## Goal

Keep the embedding cache fresh when notes are created, edited, renamed, or
deleted, mirroring the existing incremental FTS5 indexing path. Re-embedding
must not block the editor.

## Acceptance Criteria

- [ ] Creating/saving a note embeds it and upserts the vector cache.
- [ ] Renaming a note updates the cache keyed by the new path and removes the
      old entry.
- [ ] Deleting a note removes its embedding from the cache.
- [ ] Re-embedding runs in the background, batched and abortable, with progress
      reporting keyed on the workspace root path.
- [ ] Switching workspaces cancels an in-flight re-embedding run.
- [ ] The editor stays usable while re-embedding runs.

## References

- `apps/desktop/src/search/searchService.ts` — `indexDocument`, `removeIndexedDocument`, `indexWorkspace`
- `apps/desktop/src/search/useWorkspaceIndexer.ts` — abortable background index hook
- `apps/desktop/src-tauri/src/lib.rs` — `upsert_document`, `delete_document`
- `plans/pending-semantic-search-low-hard.md` — Architecture Decisions (indexing stays non-blocking)
