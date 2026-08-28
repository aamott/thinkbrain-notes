# Mobile Sync Triggers: A Policy, Not a Platform Branch

**Date:** 2026-08-28 · **Story:**
`plans/mobile/pending-mobile_sync_triggers-high-med.md`

## The problem

`registry.rs` runs a sweeper thread on a 500ms tick (`TICK`), firing a round
trip once a vault has been still for 30 seconds (`IDLE`), no more often than
once a minute (`CAP`). Every one of those numbers is an inference about what
the user is doing, drawn from wall-clock idle time.

Android freezes the process when the app goes to background. Those timers do
not merely fail to fire while frozen — they return to a clock that moved
without them. A user who comes back after an hour gets a sync they did not ask
for, at the moment they opened their notes, competing with the screen they are
trying to read. The `CAP` does not protect them: from the sweeper's point of
view, no time passed.

Idle inference is a desktop idea. A desktop process keeps running, and its
clock keeps meaning something.

## What the sweeper actually does

Worth stating precisely, because the story originally proposed not running the
sweeper on Android, and that would have been wrong. Each tick does three
things:

```rust
engine.record_settled(now);        // local version history
maybe_sync(&key, &engine, now);    // the idle inference — the actual problem
maybe_maintain(&key, &engine);     // history pruning
```

Only the middle one touches the network. `record_settled` is what gives a vault
its version history, and firing it immediately after a freeze is *desirable* —
it records the note the user was editing. `maybe_maintain` is local and cheap.

**The sweeper keeps running on every platform.** The change is to how
`maybe_sync` decides, not to whether the thread exists.

## Decision 1: a policy setting both platforms honour

A single setting, `sync.trigger`:

| Value | Behaviour |
|---|---|
| `idle` | Sync once the vault has been quiet for `IDLE`, capped by `CAP`. Today's desktop behaviour, **exactly** unchanged: no foreground trigger, no background flush. |
| `foreground` | Sync on workspace open **unconditionally**, and on return to foreground **only when** the last successful sync is older than the threshold. Backgrounding flushes and pushes (see Decision 4). |
| `manual` | Only on explicit request. No automatic network at all, in any lifecycle event. |

Three points that are easy to read past:

- **Opening a vault always syncs under `foreground`**, threshold or not. Opening
  is a deliberate act, and it is the moment a stale vault is most visible.
  Staleness gates only the *return* to foreground, which happens far more often
  and is usually incidental.
- **`manual` still records locally.** The sweeper is untouched, so version
  history, settling and maintenance continue on every policy. `manual` governs
  the network, not the vault.
- **The lifecycle triggers belong to `foreground` alone.** A desktop user on
  `idle` sees no behaviour change whatsoever from this work — minimising a
  window will not start a sync.

Defaults: **desktop `idle`, mobile `foreground`.**

The important consequence: **no `cfg(target_os)` appears in the sync code.**
`maybe_sync` consults the policy; the platform only chooses a default. A
platform branch here would be a special case layered onto shared
infrastructure, and this codebase has already been bitten once by that shape —
see the import/push review in
`plans/mobile/pending-android_anonymous_clone-high-med.md`.

Rejected alternatives:

- **A mobile-only setting.** The settings system has no platform-conditional
  visibility, so this would mean adding that mechanism to a shared package —
  more machinery than the shared policy needs, to express less.
- **No setting, hardcoded per platform.** Cheaper now, but customisation was an
  explicit requirement, and retrofitting a setting usually means reshaping the
  thing it configures.

The cost accepted: desktop sync behaviour becomes user-changeable, and someone
who selects `manual` will stop syncing automatically. That is a legitimate
choice and a real support surface. It is also honest — idle inference was
always a policy rather than a law.

## Decision 2: the foreground signal is `visibilitychange`

The webview receives `document.visibilitychange` when the Android activity
pauses and resumes. That means **no JNI hook, no `MainActivity` change, no new
native plumbing.**

That matters more than convenience. `MainActivity.onCreate` already carries a
load-bearing ordering constraint — `ndk-context` must be published before
`super.onCreate`, or the process aborts — and adding a second native lifecycle
dependency to that file would compound a fragile spot.

It also works on desktop, so the policy stays genuinely cross-platform rather
than being mobile machinery with a desktop stub.

**To verify before building on it:** that `visibilitychange` actually fires on
the device, checked through the DevTools harness
(`tools/android-devtools/wveval.py`). This assumption gets tested the same way
the logcat-forwarding assumption was, and for the same reason: a plausible
platform assumption is not a verified one.

## Decision 3: "stale" needs a persisted wall-clock timestamp

`Engine::last_synced` is an in-memory `Instant`. It does not survive a process
restart, and on Android it is read from precisely the clock this story exists
to distrust.

So `foreground` requires new state: **the wall-clock time of the last
successful round trip, per vault**, stored in the workspace settings file
beside `sync.destination`. Written only on success — a failed sync must not
make a vault look fresh.

Threshold: **3 minutes**, as a constant rather than a setting. Long enough that
flicking to another app and back does not resync; short enough that returning
after a meeting gets fresh notes. One less thing to explain, and easy to tune
if it proves wrong.

## Decision 4: backgrounding flushes locally, then pushes best-effort

On the `visibilitychange` → hidden path: record settled edits, then attempt a
push. Not configurable.

A killed sync is safe. `last_synced` is in-memory, the `syncing` flag is
cleared by a `Drop` guard that simply never runs, and a git push is atomic per
ref — a push that does not finish does not land, and leaves nothing persisted
that is wrong.

The honest caveat: **a background push will often be cut short, and its outcome
is not observable**, so a user could believe their edits travelled when they
did not. This is acceptable only because `foreground` catches whatever the
background missed on the next return. The background push is an optimisation
layered on a reliable trigger; nothing depends on it.

This belongs to the `foreground` policy only. Under `idle` it does not happen —
a desktop user who never changes the setting sees no new behaviour from this
work at all. Under `manual` it does not happen either, because manual means
manual.

## Scope guard

`run_trip` and the round-trip code are **unchanged** by this work. This is a
scheduling change. If implementation finds itself editing the round trip,
something has gone wrong in this design and it should stop rather than push
through.

## Testing

- Policy selection and the staleness comparison are pure logic: unit tests,
  including that a failed sync does not refresh the timestamp.
- The visibility handler gets a frontend test — foreground when stale syncs,
  foreground when fresh does not, hidden flushes.
- The device pass confirms `visibilitychange` fires and that a returning user
  does not get an unrequested sync from a stale clock.

## Risks

- **`visibilitychange` may not fire as expected on Android.** Verified first;
  if it does not, the fallback is a Kotlin lifecycle hook, which costs the
  native plumbing this design avoids.
- **Desktop users can now turn automatic sync off.** Intended, but it will
  generate "my notes stopped syncing" reports. The setting's copy has to make
  the consequence obvious at the point of choosing.
- **Three minutes is a guess.** Informed, but a guess. It is a constant so it
  can be changed in one place.
