# Story: A Sync Frozen Mid-Flight Blocks the One Meant to Replace It

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** med

> Found 2026-08-28 by the whole-branch review of `mobile-sync-triggers`, which
> asked what happens to the `syncing` flag when Android freezes a process
> rather than killing it. The device check on that branch could not reach this:
> it used a fail-fast fake remote, so no round trip was ever still in flight at
> the moment of freezing.

## What happens

1. Under `foreground`, backgrounding the app starts a round trip
   (`registry::sync_app_backgrounded`).
2. Android freezes the process before it finishes. The worker thread stops
   where it stands. `Engine::syncing` stays `true`, because the `Drop` guard
   that clears it (`round.rs`, the `Clear` struct in `sync`) only runs when the
   worker finishes — and a frozen thread does not finish, it pauses.
3. The user returns. `sync_app_foregrounded` decides correctly that this vault
   is stale and calls `start_round`.
4. `start_round_inner` calls `engine.set_syncing(true)`, which returns `false`
   because the flag was never cleared, and **returns without starting
   anything**.

The return sync — the one the whole design leans on — is silently skipped.

The frozen worker does resume alongside the process, so this is not a permanent
stall. But it resumes holding a network connection that is almost certainly
dead, so what it does is fail slowly, clear the flag on the way out, and leave
the vault unsynced with nothing scheduled to try again until the next
foreground event or a manual Sync now.

## Why the design did not catch it

The spec argues this case is safe, and the argument is sound as far as it goes:

> A killed sync is safe. `last_synced` is in-memory, the `syncing` flag is
> cleared by a `Drop` guard that simply never runs, and a git push is atomic
> per ref.
>
> — `docs/superpowers/specs/2026-08-28-mobile-sync-triggers-design.md:147`

That is about a **killed** process, where the flag dies with the memory holding
it. A **frozen** process keeps its memory, so the flag survives — and the
`Drop` guard "simply never runs" changes from a reassurance into the problem.

The spec also says the background push is "an optimisation layered on a
reliable trigger; nothing depends on it." That is exactly the claim this
breaks: the optimisation can disable the reliable trigger.

## Related, and probably the same fix

The background flush starts a **full** round trip — fetch, merge, push — where
the spec describes "record settled edits, then attempt a push"
(`registry.rs:477`, calling the same `start_round` as every other path). It is
uncapped and has no staleness gate, so every screen-off and app-switch under
`foreground` begins a fetch and a merge as well as a push.

That matters here because a fetch-and-merge takes longer than a push, which
widens the window in which a freeze catches a trip in flight — the exact
window this story is about. A push-only background path would be both closer to
the spec and less likely to be caught mid-flight.

## Shape of a fix, not yet decided

- **Give the flag an age.** Record when `syncing` was set; treat it as stale
  past some bound and allow a new trip to take over. Simple, but picking the
  bound is guesswork and it races with a genuinely slow sync.
- **Have the foreground path clear a flag it can prove is orphaned.** Needs a
  way to tell "a worker is alive and working" from "a worker was frozen
  mid-flight", which the current flag cannot express.
- **Cancel on background instead of racing on foreground.** `trip` already
  takes an `Arc<AtomicBool>` cancel token that nothing currently sets. Setting
  it as the app backgrounds — after the push has been attempted — would leave
  the flag clear.
- **Make the background path push-only**, per the related note above, so the
  window is small enough that the race stops mattering in practice.

The last two compose well and are the most honest: they make the situation rare
rather than detecting it after the fact.

## Acceptance

- [ ] A round trip interrupted by a process freeze does not prevent the next
      foreground sync from starting
- [ ] Proven by a test, not by argument — the existing suite has no way to
      express "a worker was frozen", so this likely needs the freeze simulated
      at the `Engine` level rather than on a device
- [ ] The device check that could not reach this is re-run against a remote
      that is slow rather than fail-fast, so a trip really is in flight when
      the app is backgrounded
- [ ] `pnpm qa` green
