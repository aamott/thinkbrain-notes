# Story: An Import Syncs Twice — Once to Import, Once on Open

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** med

> Found on 2026-08-28 while reviewing `mobile-sync-triggers`, by an agent
> tracing what `attach` does under each sync policy. It is **pre-existing** and
> was not introduced by that branch, which is why it was written down rather
> than fixed there: narrowing it touches the import and setup paths, which that
> plan's scope guard put out of bounds.

## What happens

Importing a workspace from a git link runs a full round trip, and then opening
the workspace that was just imported runs another one immediately.

1. `import.rs`'s `complete_import` (`import.rs:178`) calls `round::run_trip`
   (`import.rs:194`) — fetch, merge, and a push that doubles as a write-access
   probe.
2. The imported workspace opens in a new window, which calls
   `registry::attach`.
3. `attach` ends by starting a round trip whenever a destination is configured
   (`registry.rs:178-190`). The destination was just configured by the import,
   so it always is.

Two network round trips, back to back, on the same vault, seconds apart.

## Why it is not urgent

- **It is not incorrect.** The per-workspace lane serialises the two, so they
  cannot interleave or corrupt anything. The second trip finds nothing to do
  and reports a clean sync.
- **It is not new.** Both calls predate the sync-trigger work by a long way.
- **It is quiet.** The user sees one import that takes slightly longer than it
  needed to, on a screen where they already expect to wait.

What it costs is a wasted network round trip at the one moment a user is most
likely to be on a phone, on cellular data, watching a progress indicator.

## What made it visible

The `mobile-sync-triggers` branch gated `attach`'s open-time sync on the
policy, so under `manual` it no longer fires and the duplicate is already gone
for that one case. That branch made this **strictly better** and made it
legible — the gate is the line that invites the question "when else does this
fire redundantly?"

## The shape of a fix, not yet decided

The honest framing is that `attach` cannot tell "this workspace was just
synced by whoever opened it" from "this workspace has not synced in a week".
Options worth weighing when someone picks this up:

- **Consult the timestamp `attach` now has.** `trigger::last_synced_at` landed
  on the `mobile-sync-triggers` branch and already records successful trips per
  vault in wall-clock time. `attach` could skip its open-time trip when the last
  one was seconds ago. This is the smallest change and reuses machinery that
  now exists. It needs care: opening is deliberate, and the spec deliberately
  does *not* gate it on staleness, so any threshold here must be short enough
  to mean "this same action already did it" rather than "recently enough".
- **Have the import hand the window a note that it already synced**, so
  `attach` can skip once. More explicit and harder to get wrong, but it
  threads state through a window-opening path that currently carries none.
- **Do nothing.** A duplicate no-op sync is cheap on desktop. If the fix costs
  more complexity than the round trip costs data, that is a real answer.

`start_setup_round` (`registry.rs:526`) fires on first link setup and is worth
checking in the same pass — it may overlap with `attach` the same way.

## Acceptance

- [ ] Opening a freshly imported vault performs **one** round trip, not two,
      confirmed by counting trips in the log rather than by reading the code
- [ ] The same check run for a freshly *linked* vault (`start_setup_round`),
      with its result recorded either way
- [ ] Opening a vault that has not synced in a long time still syncs on open,
      under `idle` and `foreground` alike — the fix must not turn into a
      staleness gate on opening, which the sync-triggers design rejected
      deliberately
- [ ] `pnpm qa` green
