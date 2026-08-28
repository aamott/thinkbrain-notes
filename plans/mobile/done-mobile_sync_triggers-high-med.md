# Story: Mobile Decides When to Sync, Instead of Inferring It

**Status:** ✅ done · **Urgency:** high · **Difficulty:** med

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

- [x] `maybe_sync` fires from an explicit policy rather than from idle
      inference. **Corrected 2026-08-28:** this item used to read "the sweeper
      thread does not run on Android", which would also have killed local
      version recording and history maintenance — the sweeper does three things
      per tick and only `maybe_sync` touches the network. The sweeper keeps
      running everywhere. Confirmed by `trigger_tests.rs`/`registry_tests.rs`
      (`cargo test`, green) and on a device (see below): across two full
      background/foreground cycles, no sync-status event was ever announced
      during the frozen interval, only at the moment of the explicit
      background or foreground call.
- [x] Sync runs on workspace open, on foreground, and on explicit request.
      Foreground was directly exercised and confirmed on a device (below).
      Workspace-open and explicit-request (`sync_now`) are pre-existing paths
      this story did not change except gating workspace-open behind
      `Trigger::Manual` (task 6); both are covered by the passing `cargo test`
      / `pnpm qa` suites but were not independently re-driven on the device in
      this task.
- [x] A returning user does not get an unrequested sync fired by a stale
      clock. This is the device check's central finding — see below. It holds.
- [ ] Backgrounding does not leave a vault in a state a restart cannot
      recover. **Not verified.** This would require killing the process
      mid-flush (not just freezing it) and confirming the vault reopens
      cleanly afterward. Neither this task nor the device check attempted
      that; no test in the suite names this scenario either. Left unticked
      rather than assumed.
- [x] `run_trip` and the round-trip code are unchanged by this story.
      Checked directly: `git show 700b5d4 -- .../sync/round.rs` is the only
      change this story's commits made to `round.rs`, and it is a 3-line
      addition of a `record_round_trip` call after the round trip already
      finished — not a change to `run_trip`/`round::sync`'s fetch/merge/push
      logic. `engine.rs` was not touched by any commit on this branch.
- [x] `pnpm qa` green. See below — ran clean on 2026-08-28.

## Not in scope

Credentials, and therefore private repositories — that is
`pending-mobile_git_access-high-hard.md`. This story is worth doing even if
only public repositories ever sync, and that story is worth finishing even if
sync only ever runs when someone asks for it.

## Verified on a device

Confirmed 2026-08-28 on an Android emulator (emulator-5554, existing debug
install of `com.thinkbrain.notes`, pid 14213) via the WebView DevTools
protocol (`tools/android-devtools/wveval.py`):

A listener was installed in the webview:

```js
window.__vis = [];
document.addEventListener('visibilitychange', () => window.__vis.push(document.visibilityState));
```

The app was then backgrounded with `adb shell input keyevent KEYCODE_HOME`
and re-foregrounded 3 seconds later with
`adb shell monkey -p com.thinkbrain.notes -c android.intent.category.LAUNCHER 1`
(the process pid did not change across this cycle — the DevTools port forward
was re-established against the same pid before reading the result).

Reading `JSON.stringify(window.__vis)` afterward returned:

```
["hidden","visible"]
```

This matches the expected result exactly. `document.visibilityState`
immediately after also read back `"visible"`, consistent with the app being
foregrounded at read time. **The assumption holds**: `document.visibilitychange`
fires on this app on background/foreground with `hidden`/`visible` states, in
that order. The design may proceed using the webview visibility event as the
foreground/background signal; the Kotlin-lifecycle-hook fallback is not
needed.

### Task 8, 2026-08-28: the stale-clock symptom, on a fresh build

Unlike Task 1, this check needed a build made *after* every commit in this
story landed — the pid already running on the emulator (14213) predated the
work. Built and installed fresh:

```
$ pnpm desktop:tauri android build --debug --apk --target x86_64
...
    Finished 1 APK at:
        .../gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
$ adb install -r apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
Success
$ adb shell monkey -p com.thinkbrain.notes -c android.intent.category.LAUNCHER 1
$ adb shell pidof com.thinkbrain.notes
23140
```

New pid confirmed a genuinely fresh process, not the stale one from before
this branch.

**Step 2 — commands reachable.** Port-forwarded to pid 23140 the same way as
Task 1, then:

```
$ python3 tools/android-devtools/wveval.py "window.__TAURI_INTERNALS__.invoke('sync_app_foregrounded').then(() => 'ok', e => 'ERR ' + JSON.stringify(e))"
{ "result": { "type": "string", "value": "ok" } }
$ python3 tools/android-devtools/wveval.py "window.__TAURI_INTERNALS__.invoke('sync_app_backgrounded').then(() => 'ok', e => 'ERR ' + JSON.stringify(e))"
{ "result": { "type": "string", "value": "ok" } }
```

Both commands exist and answer from the webview.

**Step 3 — the stale-clock symptom.** `logcat` grepped for
`Tauri/Console|RustStdoutStderr` came back empty across the whole exercise —
this app's sync failure paths return a `NativeError` to the caller rather than
`eprintln!`ing (confirmed by reading `network.rs`/`mod.rs`'s
`remote_unreachable` — no `eprintln!` on that path), so that grep, as
literally written in the brief, would not have shown a positive or a negative
result here. This is worth recording as a real gap in the brief's method, not
papered over: **logcat alone could not have answered Step 3 on this build.**
Instead, a Tauri event listener on `sync://status` was used to time every
sync-status announcement precisely, which `start_round`'s implementation
(`registry.rs`) guarantees fires the moment a round trip starts and again when
it ends — a strictly more direct signal than a print statement would have
been.

Setup, via `create_managed_workspace` + `watch_workspace` + a hand-written
`sync.destination` (an intentionally nonexistent local path, so any attempt
fails fast without needing network or a real git remote — irrelevant to what
this step measures, which is *whether* a round trip is attempted, not whether
one succeeds):

```js
const ws = await inv('create_managed_workspace', { name: 'sync-trigger-check' });
await inv('watch_workspace', { rootPath: ws.root_path });
window.__syncEvents = [];
const cb = window.__TAURI_INTERNALS__.transformCallback(e => window.__syncEvents.push({t: Date.now(), payload: e.payload}));
await inv('plugin:event|listen', { event: 'sync://status', target: { kind: 'Any' }, handler: cb });
await inv('write_workspace_settings', { rootPath: ws.root_path,
  contents: JSON.stringify({ 'sync.destination': '/data/local/tmp/nonexistent-remote-for-device-check',
                              'sync.lastSyncedAt': Math.floor(Date.now()/1000) }),
  expected: null });
```

**Not-stale run.** With `sync.lastSyncedAt` set to "35 seconds ago" (well
under the 180s staleness threshold), the vault was backgrounded, held for 45
seconds — past the *old* 30-second `IDLE` — and foregrounded:

```
$ adb shell input keyevent KEYCODE_HOME   # host time 1787948021
$ sleep 45                                 # host time 1787948066
$ adb shell monkey -p com.thinkbrain.notes -c android.intent.category.LAUNCHER 1  # host time 1787948067
$ adb shell pidof com.thinkbrain.notes
23140   # same pid — frozen, not killed
```

`window.__syncEvents` for the whole cycle (device timestamps, ms since
epoch):

```
[..., {"t":1787948020840,"payload":{"rootPath":".../sync-trigger-check"}}, ...
 {"t":1787948020849,...}]
```

Every event for this vault landed between `1787948020836` and `1787948020849`
— all within the same second as the `KEYCODE_HOME` press (backgrounding
triggers an unconditional flush attempt under the `foreground` policy, which
is expected and by design). **Nothing fired between that and the
foreground call at `1787948067`, and nothing fired after it either.** No
round trip was attempted at resume, because the vault was not stale. This is
the fix, observed directly: 45 seconds of a frozen process — 15 seconds past
the old sweeper's `IDLE` — produced no sync at all on return, because the new
code checks actual elapsed wall-clock time against a real "last synced"
timestamp rather than an `Instant` that a freeze would have made meaningless.

**Stale run, for contrast.** Same vault, `sync.lastSyncedAt` rewritten to
1000 seconds ago (comfortably past the 180s threshold), then the same
background/wait-45s/foreground cycle. This time:

```
[... six events for sync-trigger-check clustered at t=1787948169117-169129 (backgrounding) ...,
 ... nothing between 1787948169129 and 1787948214501 (the 45s frozen gap) ...,
 ... six more events clustered at t=1787948214501-214510 (resume, at host time 1787948215) ...]
```

Exactly one round trip's worth of status announcements landed precisely at
resume, and only because the vault genuinely was stale — confirming the
mechanism is live, not merely inert. `sync_status` afterward showed
`sync.remote_unreachable` (expected: the destination was a nonexistent path),
which is itself proof the attempt actually ran.

**An incidental but useful corroboration:** this build's pre-existing default
vault (`vaults/notes`, already linked to a real git remote,
`https://github.com/aamott/notes`) was open the whole time. Its background
flush was a genuine network round trip — its `sync_status` read back
`healthy` afterward with a fresh `lastCheckedAt` — and it finished and
announced its own status about 2-3 seconds *after* `KEYCODE_HOME`, before the
process actually froze (nothing else from either vault fired again until the
resume events 41 seconds later). That gap independently confirms the process
was genuinely frozen for the bulk of the 45-second wait, not merely idle,
which is the condition this whole story exists to handle correctly.

**Step 4 — desktop untouched.**

```
$ cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
test result: ok. 430 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 5.02s

$ pnpm qa
...
 Test Files  149 passed (149)
      Tests  1546 passed (1546)
...
✓ All checks passed.
```

Both green. `auto` resolves to `Idle` on desktop (unchanged, per `trigger.rs`
`platform_default`), so the sweeper's behavior there is untouched by this
story; this run is the evidence that nothing else in `pnpm qa`'s much larger
surface regressed either.

**Conclusion:** the story's central claim — that a returning Android user
does not get an unrequested sync fired by a stale clock — is confirmed
directly on a device, on a fresh build of every commit in this story. The one
acceptance item this task could not verify (recovery after the process is
*killed*, not just frozen, mid-flush) is left unticked above rather than
assumed.
