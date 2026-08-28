# Story: A Public Repository Clones Without a Sign-In

**Status:** ⬜ pending · **Urgency:** high · **Difficulty:** med

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

## Shape of the fix

Make the credential helper conditional rather than unconditional: when there is
no credential store, and no sign-in is selected or saved for the destination,
connect without a helper so gix performs a plain anonymous fetch.

Worth settling while doing it:

- Does this apply only where there is no store, or also on desktop when the
  user has chosen "No sign-in (public or local)"? The desktop dialog offers
  that option, so the same path plausibly matters there too.
- Push is different from fetch: an anonymous push cannot succeed, so `push.rs`
  should keep demanding an identity and fail with a useful message rather than
  silently attempting anonymous.

## Also worth fixing here

The classifier in `sync/mod.rs:74-96` matches on error *text* and produces copy
that names "this computer's keychain". On a phone that sentence is wrong twice
over — wrong device noun, and wrong diagnosis. Whatever this story does to the
credential path, the copy should not tell a phone user to unlock a keychain.

## Acceptance

- [ ] A public repository clones on an Android emulator with no sign-in
- [ ] The same clone succeeds on physical hardware
- [ ] Notes from the cloned vault open, edit and save
- [ ] Desktop anonymous and authenticated clones are both unchanged
- [ ] Push still requires an identity and says so clearly
- [ ] No user-visible copy tells a phone user to unlock a computer's keychain
- [ ] `pnpm qa` green
