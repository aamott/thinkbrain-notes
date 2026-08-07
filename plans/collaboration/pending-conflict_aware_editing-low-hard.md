# Conflict-Aware Editing

## Goal

Ensure concurrent edits to the same note merge without data loss or manual
conflict resolution, surfacing only genuine (non-mergeable) conflicts to the
user.

## Acceptance Criteria

- [ ] Concurrent text edits merge automatically via the CRDT layer.
- [ ] Frontmatter / metadata field edits merge field-by-field without
      clobbering unrelated fields, including unknown frontmatter fields preserved
      by value.
- [ ] Collaboration sync, indexing, and note open preserve existing
      `created_at` / `updated_at` values and never add or mutate them; only an
      explicit create/save may change timestamps.
- [ ] Only non-mergeable conflicts (e.g. incompatible structural edits) prompt
      the user; the prompt is clear and non-destructive.
- [ ] Merge behavior is tested across concurrent insert/delete/replace
      scenarios, unknown-frontmatter preservation, and timestamp stability through
      sync/index/open.
- [ ] No conflict-resolution step is required for normal single-user editing.

## References

- `packages/core/src/note-model.ts` — note and metadata model
- `packages/core/src/frontmatter.ts` — frontmatter field handling
- `plans/collaboration/pending-crdt_merge_layer-low-hard.md`

## Tests

- Concurrent frontmatter fixtures include fields unknown to the current model and
  assert their values survive merge, sync, index, open, and reserialization.
- Snapshot the Markdown before and after sync/index/open; assert no implicit
  `created_at` / `updated_at` insertion or mutation, including conflict retries and
  peer replays.
- Verify only explicit create/save updates timestamps, while ordinary single-user
  open/index paths do not write the source Markdown.
