# Merge Engine

Story 3. `(versions) → structured chunks`; UI never sees raw markers.

## Scope

- **Two modes:** three-way via gix merge where base is exact (git sync,
  story 6); two-way for cloud conflict pairs (no base — segment into
  common/differing chunks, e.g. similar-lines diff).
- **Output contract:** ordered chunks `{ common | choice{ sides } }`, each
  side tagged with source label + timestamp; `kind: text | binary`
  (binary = metadata only, never diffed). One contract for both modes — UI
  doesn't know which mode produced it.
- **Undo-safety:** call story 1 `checkpoint()` on both versions before any
  resolution write; resolution then writes merged result + runs cleanup
  (story 2).
- **Unsaved-buffer rule:** if the conflicted note is open with unsaved
  changes, "this computer" side = editor buffer, not stale disk.
- **Concurrency:** all resolution/sync writes serialized per workspace
  (single mutex; follows `WORKSPACE_ENTRY_MUTATION_LOCK` pattern).
- **Resolution write is compare-and-swap** (`expected` pattern from
  `markdown.rs`): if either side changed on disk after chunks were built
  (cloud delivered a newer version mid-resolve), abort, re-checkpoint,
  re-present the conflict. Never overwrite unseen content.
- **Post-resolution editor refresh:** echo suppression hides the app's own
  write, so open editors won't auto-reload — refresh them explicitly with the
  merged content.

## Acceptance

- [ ] Same input → same chunks (idempotent); tests for text, binary, UTF-8
      edge cases
- [ ] No resolution write without prior checkpoint (enforced in code path,
      not convention)
- [ ] Buffer rule covered by test; concurrent trigger test holds mutex
- [ ] CAS race test: side mutated mid-resolve → abort + re-present, no data
      loss; open-editor refresh test

## Status

⬜ Pending.
