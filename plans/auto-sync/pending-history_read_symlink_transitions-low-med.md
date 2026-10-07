# Story: History walk drops symlink/gitlink transitions

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** med

> From `docs/reviews/2026-10-02/symlink-gitlink-transitions-invisible` (finding deleted;
> this is the tracked work). Related to `symlink_submodule_skipped`, which covers the
> apply side — this story is the history-*read* side.

## Context

`history_walk.rs` reads non-blob entries wrong in two places:

- `blob_at` returns `None` unless `entry.mode().is_blob()`, so a note committed
  as a symlink reads as absent — no version, and a later real version reports
  `Added` instead of `Updated`.
- `touched`'s `Modification` arm matches only the *new* `entry_mode`, so a
  blob→gitlink/symlink transition drops the record entirely and the ledger
  loses the `Removed` event for a path whose blob version ceased to exist.

## Decision needed

Whether `blob_at` should read `Link` targets (symlinks are stored as blob
objects) or symlinked notes are intentionally excluded — if excluded, document
the contract in `history_walk.rs`.

## Acceptance

- [ ] A `Modification` where `previous_entry_mode.is_blob() && !entry_mode.is_blob()`
      emits `NoteChange::Removed` instead of dropping the record
- [ ] Symlink handling decided (follow or documented exclusion)
- [ ] A fixture constructs a `Link`/executable entry and pins the ledger behavior
