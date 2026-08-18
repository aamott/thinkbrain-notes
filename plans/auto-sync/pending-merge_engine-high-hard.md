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

- [x] Same input → same chunks (idempotent); tests for text, binary, UTF-8
      edge cases — `merge.rs`, with the round-trip property as the backbone:
      concatenating one side of every chunk reproduces that version's bytes
- [x] No resolution write without prior checkpoint (enforced in code path,
      not convention) — `resolve()` is the only writer, and the checkpoint is
      above every branch of it
- [x] Buffer rule covered by test — the buffer stands in for our side of the
      comparison, and deliberately does *not* stand in for the fingerprint,
      which exists to notice someone else writing
- [ ] Concurrent trigger test holds mutex — see Known gaps. Simultaneous
      resolutions of one conflict do land exactly once, and that is tested,
      but the mutex is not what the test proves
- [x] CAS race test: side mutated mid-resolve → abort + re-present, no data
      loss — either side moving refuses the write, takes no checkpoint and
      leaves both files untouched
- [x] Open-editor refresh — by *not* suppressing the echo, so the watcher's
      existing outside-edit path reloads every window. See below

## What this story decided

**Only the two-way mode is built.** Three-way needs an exact base, which only
arrives with git sync in story 6, and the contract has no slot for "which mode
made this" — so story 6 can fill the same `ConflictView` from a real merge
without the panel noticing. Writing it now would mean testing a merge against
a base nothing can yet produce.

**Refresh by announcement, not by payload.** The plan called for pushing the
merged content back to open editors. Every other write in the app claims its
own echo so the indexes ignore it; this one deliberately does not, and the
watcher then reports the note as an outside edit — which is already the path
an open editor reloads from, in every window, with no new event and no new
frontend code. The copy's deletion travels the same way, which is what takes
it out of the file list. A test pins the decision, because re-adding
suppression here would look like a consistency fix and would silently break
the refresh.

That change exposed a real defect in story 2's live detection: it paired a
conflict copy by checking the *original* existed, never the copy. Resolving
deletes the copy, the watcher reports the deletion, and the conflict the user
had just answered was raised again a second later.

**Labels sit on the version, not the chunk.** They are the same for every
chunk in a comparison, so the contract names them twice per conflict rather
than twice per hunk.

## Known gaps

- **The mutation lock is not proven by a test.** It serializes a resolution
  against an ordinary note save — the interleaving where a save lands between
  the fingerprint read and the write, and the resolution overwrites it while
  reporting success. Reaching that deterministically needs a seam to widen the
  window; without one the test would be timing-dependent. The lock is the one
  `markdown.rs` already takes, so the two paths do serialize.
- **A resolution is not itself a commit on the history branch.** It is
  checkpointed before the write, and the watcher then reports the write like
  any other, so the sweeper records it a few seconds later. Nothing forces it
  to happen sooner.

## Status

🟨 Two-way segmentation, the resolution write, the checkpoint order, the CAS
guard and cleanup are done. Three-way waits on story 6.
