# Story: Mobile Decides When to Sync, Instead of Inferring It

**Status:** ⬜ pending · **Urgency:** high · **Difficulty:** med

> Split out of `pending-mobile_git_access-high-hard.md` on 2026-08-28. That
> story carried two unrelated problems — where a token lives, and when a sync
> runs. They share a file and nothing else, and keeping them together would
> have meant "Android git works" could not be called done until a scheduling
> rewrite landed too.

## Why this is not "background sync is missing"

It is worse than missing. It is actively wrong.

`registry.rs` runs a sweeper thread on a 500ms tick (`TICK`), firing a round
trip after 30 seconds of idle (`IDLE`), capped at once per 60 seconds (`CAP`).
Every one of those is a wall-clock inference about what the user is doing.

Android freezes the process when the app goes to background. Those timers do
not merely fail to fire while frozen — they come back to a clock that has moved
without them. A user who returns after an hour gets a sync they did not ask
for, at the moment they reopened their notes, competing with the screen they
are trying to read. The 60-second cap does not protect them, because from the
sweeper's point of view no time passed at all.

Idle inference is a desktop idea. A desktop process keeps running and its clock
keeps meaning something.

> Design: `docs/superpowers/specs/2026-08-28-mobile-sync-triggers-design.md`,
> which settles this as a cross-platform `sync.trigger` policy rather than a
> mobile branch, and records why.

## Shape

Replace inference with explicit triggers on mobile:

- on workspace open
- on foreground
- on explicit user request
- a best-effort flush on background, which Android may cut short

**This is a scheduling change, not a sync-engine change.** `run_trip` already
takes everything it needs as arguments and holds no engine state and no OS
assumptions, so the same core drives both platforms. The sweeper stays
desktop-only; mobile drives `run_trip` from lifecycle events instead.

That boundary is the thing to protect. If this story finds itself editing the
round-trip code, something has gone wrong in the design.

## Worth settling while doing it

- **What "best effort on background" honestly means.** Android can kill the
  process mid-flush. A partial push is safe — git is atomic per ref — but a
  half-written settle window may not be. Decide whether the flush is skipped
  entirely when it cannot be finished, rather than started and abandoned.
- **Whether a foreground sync should be silent.** A sync that starts the
  instant someone opens their notes competes with reading them. The desktop
  answer (a status line) may not be the mobile one.
- **Whether desktop should adopt the same triggers eventually.** Idle inference
  is not obviously right there either; it is just survivable. Out of scope, but
  worth not designing against.

## Acceptance

- [ ] `maybe_sync` fires from an explicit policy rather than from idle
      inference. **Corrected 2026-08-28:** this item used to read "the sweeper
      thread does not run on Android", which would also have killed local
      version recording and history maintenance — the sweeper does three things
      per tick and only `maybe_sync` touches the network. The sweeper keeps
      running everywhere
- [ ] Sync runs on workspace open, on foreground, and on explicit request
- [ ] A returning user does not get an unrequested sync fired by a stale clock
- [ ] Backgrounding does not leave a vault in a state a restart cannot recover
- [ ] `run_trip` and the round-trip code are unchanged by this story
- [ ] `pnpm qa` green

## Not in scope

Credentials, and therefore private repositories — that is
`pending-mobile_git_access-high-hard.md`. This story is worth doing even if
only public repositories ever sync, and that story is worth finishing even if
sync only ever runs when someone asks for it.
