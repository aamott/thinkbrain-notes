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

- `plans/wip-indexing-search-med-med.md` — indexing-search epic and incremental indexing foundation
- `apps/desktop/src-tauri/src/commands/search.rs` — shipped native `index_documents` and `remove_index_document` commands
- A future typed frontend bridge remains planned for native index commands; background index lifecycle wiring is still open and no hook file is assigned.
- `plans/pending-semantic-search-low-hard.md` — Architecture Decisions (indexing stays non-blocking)
