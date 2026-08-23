# Merge Engine

Story 3. `(versions) → structured chunks`; UI never sees raw markers.

## Scope

- **Two modes:** three-way via gix merge where base is exact (git sync,
  story 6); two-way for cloud conflict pairs (no base — segment into
  common/differing chunks, e.g. similar-lines diff). Both shipped, but not as
  two chunk producers — see "What this story decided".
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
- [x] Concurrent trigger test holds mutex — `resolve_after_read` parks a
      resolution between the fingerprint check and the write, and a real
      `write_markdown_document` is shown not to land in that window. Removing
      the lock fails the test, which is what makes it a proof rather than a
      description
- [x] CAS race test: side mutated mid-resolve → abort + re-present, no data
      loss — either side moving refuses the write, takes no checkpoint and
      leaves both files untouched
- [x] Open-editor refresh — by *not* suppressing the echo, so the watcher's
      existing outside-edit path reloads every window. See below

## What this story decided

**One mode reaches the UI, because three-way reduces to two-way.** The plan
expected three-way to be a second producer of chunks, filling the same
`ConflictView` from a real base. It arrived with story 6 as something better:
`round.rs::merge` runs `repo.merge_commits` with `FileFavor::Ours`, so gix
resolves every hunk that does not genuinely overlap, and only the ones that do
are written out as copies beside the note — the same shape a cloud daemon
leaves. `resolve::view` then segments those with `merge::compare`, the two-way
path, without knowing where they came from.

So the goal of "the UI doesn't know which mode produced it" is met by there
being one mode at the UI, rather than two converging on a contract. Less code
and one path to test. It also means the base is used where it is exact — to
*avoid* asking the question — instead of to decorate a comparison the user
would still have to answer by hand.

`round_tests.rs` covers it end to end: two devices change the same line, the
merge asks about exactly one thing, our wording is not overwritten, theirs
lands beside it, and the copy is in a shape `conflict::pair` recognises. A
sibling test pins that no conflict marker is ever written into a note.

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

**The lock is proven by parking a resolution inside it.** This story held the
mutex test open on the grounds that reaching the window needed a seam, and that
without one the test would be timing-dependent. `resolve_after_read` — the
`maintain_after_lock` pattern, `#[cfg(test)]` and compiled out of release —
opens that seam after the fingerprint check and before the first write. The
test parks a resolution there, asserts the note is still untouched (so the
window is the real one), then runs an actual note save against it.

One bounded wait remains, and it only fails in the sound direction: a save that
*completes* while the resolution is parked means the lock is not held, which is
the defect. A slow save cannot fail the test, only pass it for a weaker reason.
Verified by deleting the lock and watching the test fail with its own message,
then restoring it.

The test releases the parked thread before asserting. Failing first would
deadlock `thread::scope` waiting on a resolution nothing would ever let go —
which is what it did on the first attempt, and is worth knowing before the next
seam is written.

**Labels sit on the version, not the chunk.** They are the same for every
chunk in a comparison, so the contract names them twice per conflict rather
than twice per hunk.

## Known gaps

- **A resolution is not itself a commit on the history branch.** It is
  checkpointed before the write, and the watcher then reports the write like
  any other, so the sweeper records it a few seconds later. Nothing forces it
  to happen sooner.

## Status

✅ Two-way segmentation, three-way merge (shipped with story 6, as reduction
to copies), the resolution write, the checkpoint order, the CAS guard, cleanup
and the mutation lock are done and covered. The one remaining note under Known
gaps is a timing observation about *when* a resolution reaches the history
branch, not missing work.
