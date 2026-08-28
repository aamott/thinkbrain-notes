# Story: Importing a Repository You Cannot Push To

**Status:** 🟨 wip · **Urgency:** high · **Difficulty:** med

> Found by running the clone on a device after the TLS fix landed, 2026-08-27
> (`pending-android_tls_platform_verifier-high-med.md`). This is what now
> stands between Android and a working public clone.

## What happens

With TLS working, cloning `https://github.com/octocat/Hello-World.git` on an
emulator fails with `sync.credentials_invalid` — "The username or access token
was not accepted" — for a **public** repository that needs no token at all, on
a device that correctly reports it has nowhere to keep one.

## Why

gix does not treat a credential helper returning "nothing" as "go anonymous".
Its own message is:

> No credentials were returned at all as if the credential helper isn't
> functioning

which `sync/mod.rs:74-96` maps to `sync.credentials_invalid`. There is already
a test pinning that mapping (`mod.rs:204`).

So the shape of the problem is: **once a credential helper is configured, gix
expects it to produce an identity.** Anonymous access means not configuring one.

The helper is wired in unconditionally at two sites:

- `network.rs:92` — `.with_credentials(super::credentials::provide)`
- `push.rs:261` — `handshake(..., super::credentials::provide, ...)`

## What has already been done

`credentials::offer_or_anonymous` (`sync/credentials.rs`) now separates "this
platform has no credential store" (`sync.auth_required`) from "the store is
here and it failed" (`sync.credentials_unavailable`), so the former no longer
propagates as a keychain fault. That was a necessary distinction — before it,
Android showed "Unlock this computer's keychain" on a phone — **but on its own
it does not make a public clone work**, because gix rejects the resulting
`Ok(None)`. It is groundwork, not the fix.

## Second session on a device (2026-08-27, later): read this before retrying

An attempt to pin the exact failure did **not** converge, and the reason
matters more than the attempt.

**gix only calls the credential helper after a 401.** `gix-protocol`'s
`handshake/function.rs:50-55` invokes `authenticate` solely in the
`PermissionDenied` branch, then errors with `EmptyCredentials` if it gets
nothing back. So the helper is never consulted for a genuinely public fetch —
which means the earlier `sync.credentials_invalid` implies the device received
a 401 from GitHub for a repository the **host** fetches anonymously with HTTP
200 (verified: `curl` against
`https://github.com/octocat/Hello-World.git/info/refs?service=git-upload-pack`).

Repeated runs produced *different* errors from identical input —
`sync.credentials_invalid`, then `sync.remote_unreachable`, then
`sync.import_name_invalid`. The last one is raised by `child_name_from_link`
**before any network call**, on a link whose preview had already derived
`Hello-World` correctly.

That inconsistency is at least partly the test harness, not the app: the device
was driven by blind `adb shell input tap` at fixed coordinates, and the dialog
shifts when the soft keyboard opens or closes. `input keyevent 4` (BACK) in
particular perturbs app state — Tauri installs a back callback and
`MainActivity` sets `handleBackNavigation = false`. The `import_name_invalid`
result only ever appeared on runs where BACK was pressed.

**Do not trust any of those three error codes as the real one.** They were
gathered through an unreliable harness.

### What to do differently

Get a deterministic trigger before diagnosing further. Options, cheapest first:

- Drive the Tauri command directly rather than through the UI, so the input is
  exact and repeatable.
- Locate the button per-run with `uiautomator dump` instead of fixed
  coordinates.
- Add a real (non-temporary) log line for sync failures. `sync/mod.rs` already
  assembles a redacted `details` chain and stores it on the `NativeError`, but
  nothing surfaces it, so a device failure is diagnosed blind. A temporary
  `eprintln!` there was tried and never fired, which is itself a clue: the
  failing path returns through `remote_unreachable` or an earlier validation
  error rather than the classifier body.

The one thing established beyond doubt is the gix behaviour above: **anonymous
means not configuring a helper**, and `Ok(None)` from a configured helper is an
error by construction.

## Diagnosed 2026-08-28: the clone was never the problem

Reproduced deterministically (see harness below) and the answer overturns this
story's original premise. The full failure, captured from the `sync://import`
event payload rather than read off a screen:

```
code:    sync.credentials_invalid
message: The username or access token was not accepted.
details: No credentials were returned at all as if the credential helper
         isn't functioning unknowingly
```

The phase sequence is what gives it away: `saving` -> `checking` ->
`combining` -> `sending` -> `failed`. Per `engine.rs:59-68`, `Checking` is the
**fetch** and `Combining` is the **merge**. Both completed. It failed at
`Sending`, which is the **push**.

**So the public clone works.** TLS works, the fetch works, the merge works.
What fails is the push that `complete_import` performs immediately afterwards,
to a repository the device has no credentials for and no right to write to.
GitHub answers the push with a 401, gix then consults the credential helper
exactly as documented, the helper has no store to read from, and gix rejects
the resulting nothing as `EmptyCredentials`.

Worse than a bad error message: `complete_import` (`import.rs:182-184`) treats
any error from `run_trip` as fatal and calls `cleanup_import`. So a repository
that fetched and merged perfectly is **deleted** because the push failed. The
vault directory is gone afterwards — confirmed by inspecting
`/data/data/com.thinkbrain.notes/vaults/` after the failure.

`round.rs:207-217` is the site: once a HEAD commit exists, `push::send` runs
unconditionally. Adopting the remote's history creates that HEAD, so importing
any repository guarantees a push attempt.

### This is not an Android bug

`complete_import` -> `run_trip` -> `push::send` is shared code with no target
gating. Any desktop user importing a repository they cannot push to — a public
repo they do not own, a read-only mirror, "No sign-in (public or local)" —
should hit the same rollback. Android only surfaced it first because it has no
credential store at all. **Confirm on desktop before designing the fix**; it
widens the story considerably if true, and it is cheap to check.

### What this retires

The three error codes recorded below as untrustworthy can now be set aside;
`sync.credentials_invalid` was the real one, arriving for a reason nobody
guessed. The earlier reasoning about gix's helper-after-401 behaviour was
correct but was applied to the wrong operation — the 401 comes from the push,
never from the fetch.

## The harness, which now exists

The previous session's suggestions were wrong in one case and unnecessary in
the other.

**`uiautomator dump` does not work here.** The WebView exposes no accessibility
tree, so a dump returns only `action_bar_root` and an empty content frame. No
element of the app's UI is visible to it at any point. Do not spend time on it.

**What works: the WebView's own DevTools protocol.** Debug builds expose
`@webview_devtools_remote_<pid>`, so the app can be driven exactly:

```bash
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.thinkbrain.notes)
python3 tools/android-devtools/wveval.py "<javascript>"
```

That gives the ability to call a Tauri command with exact arguments and to
subscribe to events, which is how the payload above was captured — no tapping,
no coordinates, no keyboard shifting the layout. `tools/android-devtools/`
holds the script and the recipe.

One gotcha, already handled in the script: the DevTools endpoint rejects a
WebSocket carrying an `Origin` header, so the connection must suppress it.

## Console logging now reaches logcat

`invokeNativeCommand` logs every failed native command as a single formatted
line, which wry forwards to logcat under tag `Tauri/Console` at level `E`.
Verified on the emulator.

Two limits found by reading `wry-0.55.1/src/android/kotlin/`:

- **Objects are silently dropped.** `RustWebChromeClient.isValidMsg` discards
  any message equal to `[object Object]`, so `console.error("...", errorObject)`
  logs *nothing*. Confirmed empirically. This is why the log is one
  pre-formatted string, and it must stay that way.
- **Debug builds only.** `Logger.error` is gated on `BuildConfig.DEBUG`
  (`Logger.kt:83-85`), so console output vanishes in release. Field diagnostics
  from a user's installed build would need a Rust-side log instead.

**It did not catch this failure**, and that is worth knowing: the import
reports through the `sync://import` event, not through a command rejection, so
it never passes through `invokeNativeCommand`. The event payload carries the
same `details`, which is how it was read here. Any future work that wants
device-visible logging of sync failures has to cover the event path too.

## Shape of the fix — needs a design decision

The original shape (make the *fetch* credential helper conditional) addresses a
problem that does not exist. The fetch already works. The question is what an
import should do when the push at the end of it cannot succeed, and that is a
product decision rather than a mechanical one:

1. **Do not push during an import at all.** An import is "get me this
   repository"; pushing is the next sync's job. Simplest, and makes the import
   succeed for read-only repositories. Leaves the vault linked to a remote it
   may never be able to write to, which the next sync surfaces anyway.
2. **Push, but do not let its failure destroy the import.** Keep the vault,
   report it as fetched-but-not-sent. Preserves current behaviour where the
   push does work, and needs a state for "linked, read-only".
3. **Decide up front from the sign-in choice.** If there is no credential
   store, or the user picked "No sign-in", import read-only and say so.
   Clearest to the user, most work, needs UI copy.

Whichever is chosen, an anonymous push must still fail loudly when the user
actually asked to push — silently swallowing that would be worse than today.

Recommendation: **2**, because it is the smallest change that stops deleting
good data, and it keeps the existing behaviour for the common case. 1 and 3 can
follow if the read-only state deserves first-class treatment.

## Also worth fixing here

The classifier in `sync/mod.rs:74-96` matches on error *text* and produces copy
that names "this computer's keychain". On a phone that sentence is wrong twice
over — wrong device noun, and wrong diagnosis. Whatever this story does to the
credential path, the copy should not tell a phone user to unlock a keychain.

## Fixed 2026-08-28 (option 2: keep the vault, report the one-way trip)

`round.rs` gained a `PushPolicy`. A sync passes `Required` and still fails
loudly when it cannot send, because the user asked to send. An import passes
`Optional`: a failed push returns `push::Landed::NotSent { reason }` with the
fetch and merge intact, instead of an error that would trigger
`cleanup_import`.

`complete_import` now returns `Imported { path, landed }` rather than a bare
path, so the outcome survives to the caller, and `ImportProgress` carries
`notSent`. The dialog raises a sticky warning — "Brought in, but not linked
both ways" — instead of closing on a silent success, because someone who
believes their edits are travelling back only finds out otherwise much later.

Verified on the emulator against `https://github.com/octocat/Hello-World.git`
with no sign-in:

```
saving -> checking -> combining -> sending -> ok (notSent: "The username or
access token was not accepted.")
```

and the vault survives with its content:

```
/data/data/com.thinkbrain.notes/vaults/Hello-World/README  ->  "Hello World!"
```

Also fixed in passing: `vite.config.ts` set `reporters: undefined` when
`QA_QUIET` was unset, and vitest 4 reads `.length` off that during config
resolution, so plain `pnpm test` died at startup without running anything.
`pnpm qa` always sets `QA_QUIET`, which is why it never surfaced there.

## Acceptance

- [x] A public repository clones on an Android emulator with no sign-in
- [ ] The same clone succeeds on physical hardware — no device available
- [ ] Notes from the cloned vault open, edit and save — the file is on disk and
      readable, but opening and editing it through the UI has not been driven
- [x] Desktop anonymous and authenticated clones are both unchanged — the sync
      path keeps `PushPolicy::Required`, covered by the existing suite. Note
      that desktop import of a repository the user cannot push to is *changed*,
      and deliberately: it used to delete the vault too
- [x] Push still requires an identity — a sync's push failure is still an error
- [ ] No user-visible copy tells a phone user to unlock a computer's keychain —
      **still open**. `mod.rs:78` still says "this computer's keychain". Less
      reachable now that imports succeed, but not gone, and the replacement
      wording is a product decision rather than a mechanical edit
- [x] `pnpm qa` green — 414 Rust tests, full frontend suite
