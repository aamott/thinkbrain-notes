# CRDT / Merge Layer for Markdown Documents

## Goal

Provide a conflict-free merge layer over Markdown document state so concurrent
edits from multiple users converge deterministically without a central
authority. Likely a CRDT library (Yjs / Automerge) bound to the note document
model.

## Acceptance Criteria

- [ ] A merge layer in `packages/core` exposes document state and applies
      remote operations without data loss.
- [ ] Concurrent edits to the same note converge to the same result on all
      peers.
- [ ] CRDT/metadata state is stored in app-data, never in the vault or SQLite
      cache.
- [ ] Unknown frontmatter fields are preserved by value through local/remote
      merge and serialization; CRDT sync never drops fields it does not understand.
- [ ] Collaboration sync, indexing, and note open do not create or mutate
      `created_at` / `updated_at`; timestamps change only on explicit create/save.
- [ ] Single-user mode does not instantiate or depend on the CRDT layer.
- [ ] Unit tests cover: concurrent insert, concurrent delete, interleaved
      edits, peer join/leave mid-edit, unknown-frontmatter preservation, and
      timestamp stability across sync/index/open.

## References

- `packages/core/src/note-model.ts` — `NoteMetadata`, `SerializableNote`
- `packages/core/src/frontmatter.ts` — document serialization
- `plans/wip-collaboration-low-hard.md` — Architecture Decisions
- `plans/wip-note-model-low-hard.md` — document model stability

## Tests

- CRDT round-trip fixtures include known and unknown frontmatter keys, asserting
  unknown values survive local edit, remote merge, and reserialization.
- Sync/index/open integration fixtures snapshot the source Markdown and assert no
  `created_at` / `updated_at` field is added or changed unless an explicit save is
  part of the fixture.
- Two-peer convergence tests cover the same invariants after concurrent body and
  frontmatter edits, including join/leave and replay.
