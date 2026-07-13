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
- [ ] Single-user mode does not instantiate or depend on the CRDT layer.
- [ ] Unit tests cover: concurrent insert, concurrent delete, interleaved
      edits, and peer join/leave mid-edit.

## References

- `packages/core/src/note-model.ts` — `NoteMetadata`, `SerializableNote`
- `packages/core/src/frontmatter.ts` — document serialization
- `plans/collaboration.md` — Architecture Decisions
- `plans/note-model.md` — document model stability
