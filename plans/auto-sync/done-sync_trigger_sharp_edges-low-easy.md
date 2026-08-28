# Story: Three Sharp Edges on the Sync Trigger Policy

**Status:** ✅ done — two of three, third split out · **Urgency:** low · **Difficulty:** easy

> Found 2026-08-28 by the whole-branch review of `mobile-sync-triggers`. Three
> small, unrelated things, grouped because each is a few lines and none is worth
> its own story. Split them out if one turns out to be bigger than it looks.

## 1. An exported setting carries `idle` onto a phone

`sync.trigger` does not set `portable: false`, so it travels in a settings
export like any other app preference — unlike its neighbours `destination`,
`signInProfile` and `historyPolicy`, which all opt out.

That is right for `auto`, `foreground` and `manual`. It is a trap for `idle`:
a desktop user who deliberately chose `idle`, exported their settings and
imported them on a phone lands on the one policy that does not work there. The
sweeper's timer is the trigger the OS freezes — which is the bug the whole
`mobile-sync-triggers` branch exists to fix — and they also lose the background
flush, so nothing leaves the device while they are away.

`auto` exists precisely so a preference can mean "whichever suits this device".
An explicit `idle` says the opposite, and says it on a device where it is wrong.

Worth deciding: is `portable: false` right (the policy is a per-device fact,
like the git link), or should an import that lands `idle` on a phone say
something?

## 2. A backwards clock jump makes a vault permanently fresh

`is_stale` (`trigger.rs:146`) compares `now_secs.saturating_sub(last)` against
the threshold. If the wall clock moves backwards — a timezone-adjacent bug, an
NTP correction, a user setting the date — `last` ends up in the future,
`saturating_sub` floors to `0`, and the vault reads as fresh forever.

Nothing recovers it except reopening the workspace, which syncs on open under
every policy but `manual`, or pressing Sync now. So the exposure is bounded and
recoverable. But "the clock went backwards, so this vault will never sync on
return again" is a surprising amount of consequence for a saturating subtract.

A timestamp further in the future than the threshold is not evidence of
freshness; it is evidence the clock is untrustworthy. Treating it as stale is
both safer and simpler to explain.

## 3. `record_round_trip` writes workspace settings without the lock

`crate::commands::settings` guards workspace-settings writes with
`WORKSPACE_SETTINGS_MUTATION_LOCK` (`settings.rs:16`, taken at `:274`) and with
an `expected`-contents check, so two writers cannot clobber each other.
`trigger::record_round_trip` does its own read-modify-write of the same file
without either.

So a sync completing at the same moment as a settings save can lose one of the
two writes. In practice the window is narrow and the loser is usually
`sync.lastSyncedAt`, whose loss costs one extra sync on the next return.

There is precedent for going around the lock — `import.rs` does — so this is
not obviously wrong, and taking the lock from inside a sync worker needs a look
at what else holds it and for how long. But the reason for the exception should
be written down, or the exception removed.

## What happened, 2026-08-28

**Edge 1 — an exported setting carries `idle` onto a phone: gone.**
`docs/superpowers/specs/2026-08-28-sync-schedule-design.md` deleted
`sync.trigger` entirely. The five settings that replace it describe a
schedule, not a platform, so none of them is a per-device fact and all are
portable. `portable: false` was never needed; there is nothing left to carry
onto a phone that a phone cannot honour. `SettingsImportExport.test.ts` now
names all five, so an accidental opt-out would fail a test.

**Edge 2 — a backwards clock makes a vault permanently fresh: fixed.**
`schedule::elapsed_at_least` replaces the `saturating_sub`, and reads a
timestamp from the future as *due* rather than fresh, on the reasoning this
story gives: a future timestamp is evidence the clock is untrustworthy, not
evidence of freshness. Covered by
`a_timestamp_from_the_future_reads_as_due_not_fresh`.

**Edge 3 — `record_round_trip` writes workspace settings without the lock:
still open, and split into its own story.** See
`plans/auto-sync/pending-last_sync_timestamp_skips_the_settings_lock-low-med.md`.
It was left alone deliberately rather than by oversight: the loser of that
race is `sync.lastSyncedAt`, whose loss costs one extra sync, and taking the
settings lock from inside a sync worker needs a look at what else holds it and
for how long. That is a different question from the two above and does not
belong in a story marked done.

## Acceptance

- [x] A decision recorded on each of the three, with reasoning
- [x] Any behaviour change carries a test that fails without it
- [x] `pnpm qa` green
