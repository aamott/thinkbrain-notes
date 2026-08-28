# Story: Recording the Last Sync Time Skips the Settings Lock

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** med

> Split out of `done-sync_trigger_sharp_edges-low-easy.md` on 2026-08-28, where
> it was the third of three edges. The other two were closed by the sync
> schedule work; this one is a different question and was left alone
> deliberately rather than by oversight.

## What happens

`crate::commands::settings` guards workspace-settings writes with
`WORKSPACE_SETTINGS_MUTATION_LOCK` (`settings.rs:16`, taken at `:274`) and with
an `expected`-contents check, so two writers cannot clobber each other.

`schedule::record_round_trip` does its own read-modify-write of the same file
with neither. A sync finishing at the same moment as a settings save can
therefore lose one of the two writes.

## Why it was left

The window is narrow, and the loser is usually `sync.lastSyncedAt`, whose loss
costs one extra sync on the next open. There is precedent for going around the
lock — `import.rs` does — so it is not obviously wrong. And taking the lock
from inside a sync worker needs a look at what else holds it and for how long,
which is a real piece of work rather than a one-line change.

What is not acceptable is leaving the exception undocumented, which is what
this story is for.

## What has changed since it was written

`record_round_trip` now runs on every successful round trip under a schedule
the user sets, and the floor on `sync.intervalSeconds` is 30 seconds. So the
write happens more often than it did under the old policy, where only some
trips reached it. That raises the collision odds without changing the
consequence.

It also now guards against the worse failure already: a settings file that
cannot be *read* is never written on top of, so the race cannot drop
`sync.destination` and unlink a vault. What remains is a lost timestamp.

## Acceptance

- [ ] Either `record_round_trip` takes `WORKSPACE_SETTINGS_MUTATION_LOCK`, or
      the reason it does not is written down where the next reader will find
      it — in the function, not only in this story
- [ ] If it takes the lock, something proves a sync completing during a
      settings save loses neither write
- [ ] Whichever way it goes, `import.rs`'s matching exception is either
      justified in the same terms or fixed alongside
- [ ] `pnpm qa` green
