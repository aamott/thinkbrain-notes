# Conflict-Aware Editing

## Goal

Ensure concurrent edits to the same note merge without data loss or manual
conflict resolution, surfacing only genuine (non-mergeable) conflicts to the
user.

## Acceptance Criteria

- [ ] Concurrent text edits merge automatically via the CRDT layer.
- [ ] Frontmatter / metadata field edits merge field-by-field without
      clobbering unrelated fields.
- [ ] Only non-mergeable conflicts (e.g. incompatible structural edits) prompt
      the user; the prompt is clear and non-destructive.
- [ ] Merge behavior is tested across concurrent insert/delete/replace
      scenarios.
- [ ] No conflict-resolution step is required for normal single-user editing.

## References

- `packages/core/src/note-model.ts` — note and metadata model
- `packages/core/src/frontmatter.ts` — frontmatter field handling
- `plans/collaboration/pending-crdt_merge_layer-low-hard.md`
