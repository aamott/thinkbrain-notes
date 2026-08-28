# Android Git Access Design

> Design spec for cloning and syncing private Git repositories on Android.
> Drafted 2026-08-27, pending review. Supersedes the credential-storage
> candidates recorded in `plans/mobile/pending-mobile_git_access-high-hard.md`
> and answers the storage question left open by
> `plans/extensions/pending-extension_secret_storage-med-hard.md`.

## Problem

A vault most plausibly arrives on a phone by being cloned, because cloning is
the one way in that needs no folder picker — that is why
`mobile/done-android_workspace_access-high-hard.md` chose clone-first
onboarding. But on Android `commands/sync/credentials.rs` compiles to its
`unsupported!` stubs, which return `sync.auth_required`. A public repository
can be cloned; a private one cannot, and most people's notes are private.

`keyring` v3 has no Android backend and is gated out of the build entirely
(`Cargo.toml:47-49`). So the question is not "make keyring work" but **what
holds a token on this platform** — the same question the extensions epic
records as an explicit unmade security decision. Mobile is what forces it, and
whatever is chosen has to serve both.

## What is already true

More is in place than the story assumes. Establishing this matters, because it
narrows the work to credentials plus scheduling rather than a mobile sync port.

- **The Android scaffold is real and committed.** `gen/android/` holds the
  generated project, package `com.thinkbrain.notes`, `minSdk 24` /
  `targetSdk 36` (`app/build.gradle.kts:30-36`), all four ABIs, and a custom
  Gradle `RustPlugin` that drives the per-ABI Rust build. `release.yml` can
  already produce a signed AAB and APK behind `ANDROID_RELEASE_ENABLED`.
- **The managed clone path already exists.**
  `import_managed_workspace_from_git_link` (`sync/import.rs:239`) reuses the
  desktop import worker — `prepare_import` → `bootstrap::bootstrap` →
  `round::run_trip` — with the same `sync://import` event and opaque request
  id. The story's "reuse rather than duplicate" criterion is met *in code*.
- **The sync core is platform-clean.**
  `run_trip(repo, vault, destination, profile_id, on_phase)`
  (`round.rs:128-134`) takes no engine and makes no OS assumptions. The whole
  Rust tree holds two `cfg` sites: the mobile entry point (`lib.rs:39`) and the
  updater gate (`lib.rs:49`). Credentials entangle at exactly two points —
  `credentials::provide` (`network.rs:92`, `push.rs:261`) and
  `credentials::with_profile` (`round.rs:160,214`).
- **The import dialog already tells the truth.**
  `GitLinkImportDialog.tsx:376,381-383` hides the sign-in fields and surfaces
  `storageMessage` whenever `storage !== "available"`, so an Android user is
  already told sign-in is unavailable rather than being failed silently.

What has never happened: **gix has never been run on a device.** The CI gate is
`cargo check -p gix` for `aarch64-linux-android` — one package, no link step,
no Tauri build, as `ci.yml`'s own comment says. Nothing has proven a clone.

## Approach: adopt the keyring ecosystem's Android store

The story named three candidates. A fourth has appeared since it was written,
and it is better than all of them.

**Rejected — a bespoke Kotlin plugin over Android Keystore.** The story's
first candidate, and the reason it was rated hard. It means owning a JNI
surface and a Kotlin module this project has no other need for, plus a second
credential abstraction that desktop does not share. Correct, and more than the
problem costs.

**Rejected — an encrypted file in app-data with a hand-rolled scheme.** The
extensions story already forbids this in as many words: "never invent plaintext
or improvised encryption." It also leaves desktop and mobile on different
storage models permanently.

**Rejected — `tauri-plugin-keystore` (impierce).** Closer, but a poor fit
here. It requires **API 28** against our `minSdk 24`; it assumes biometrics
are enrolled and performs no preflight check before touching the keystore, so
a device without a fingerprint enrolled fails at use rather than at setup; and
it is a Tauri-plugin abstraction rather than a keyring one, so `credentials.rs`
would keep its two-code-path split forever.

**Chosen — keyring v4 plus `android-native-keyring-store`.**
[`android-native-keyring-store`](https://crates.io/crates/android-native-keyring-store)
v1.0.0 (July 2026) comes from `open-source-cooperative`, the same org that
maintains the `keyring` crate already in this build. It stores credentials in
Android SharedPreferences encrypted under a dedicated Android Keystore entry —
precisely the story's second candidate, but implemented and maintained by the
people who own the abstraction we already depend on. It supports **API 24+**,
matching `minSdk` exactly, and names Tauri Mobile among the frameworks that
already initialise what it needs.

This is the story's "encrypted app-data, with the key from Keystore" candidate
with the custody question answered: we do not write or own the encryption.

### What it costs: a keyring v3 → v4 migration

`android-native-keyring-store` requires `keyring-core ^1`, which is keyring
**v4**. This repo pins `keyring = "3"`. That is the real groundwork, and it is
the reason this design splits into two stories.

[keyring v4 restructured the crate](https://github.com/open-source-cooperative/keyring-rs/wiki/Keyring-Core):
the API moved into `keyring-core`, each platform store became its own crate,
and **store selection moved from a compile-time feature to an explicit
`set_default_store` call at application startup**.

That change is what makes this design cheap rather than invasive. Today
`credentials.rs` carries a `supported!` / `unsupported!` macro pair
(`credentials.rs:364-383`) that compiles two different bodies for every
keychain helper, plus matching `cfg` gates on `SERVICE`, `STORAGE_PROBE` and
`storage_status`. Under v4 the platform choice happens once, at startup, in
`lib.rs`:

```text
desktop  -> keyring platform store (apple / windows / linux-native)
android  -> android-native-keyring-store
otherwise-> no default store registered; storage_status reports Unsupported
```

and `credentials.rs` collapses to one code path calling `Entry`. The macros
and every `cfg` on them are deleted rather than extended. `has_keychain` in
`platform_capabilities` (`workspace_managed.rs:83`) stops being a hardcoded
`cfg!` and starts reporting whether a store was actually registered.

The same registration is the answer the extensions epic is waiting for: one
`Entry`-shaped boundary, one namespace convention, every platform included.

## Update: story 1 has been run (2026-08-27)

The spike was executed the day this was drafted, and it changed the ordering.

The Android build links and the app runs — but **the clone fails before it
reaches the network**. `gix-transport → reqwest 0.13.4 →
rustls-platform-verifier 0.7.0` panics on Android with "Expect
rustls-platform-verifier to be initialized", because that crate validates
through the JVM Trust Manager and needs a Kotlin component plus a JNI init that
`gen/android/` does not have.

That makes TLS initialisation the **first** blocker and credentials the second.
A new story owns it: `plans/mobile/pending-android_tls_platform_verifier-high-med.md`.
The credential design below is unchanged and still correct; it simply cannot be
exercised until TLS works.

It also sharpens the `ndk_context` risk: a dependency needing its own explicit
JNI init is evidence Tauri does not auto-initialise these bridges, so
`android-native-keyring-store` should be assumed to need the same until proven
otherwise.

## Scope split

Three stories, in dependency order. The split is deliberate: the migration is
desktop-risk work with desktop-only verification, and merging it into the
Android story would make a device-flakiness failure and a keychain-migration
failure look identical while debugging.

### 1. Prove gix runs on a device (spike)

Clone a small **public** repository into a managed vault on an emulator, then
on hardware. No decisions, no new code. It exercises gix over rustls, the
managed-vault import worker end to end, and `bootstrap`'s `core.worktree`
rewrite against Android app-private storage.

This gates everything else. If it fails, the credential design is moot and the
story becomes something else — which is exactly why it comes first.

A second, smaller probe rides along: **does `ndk_context` arrive initialised
under Tauri Mobile?** `android-native-keyring-store` needs the NDK application
context bound before any store is created. `android-activity` should provide
it, but "should" is what the cross-compile gate already taught us to distrust.
Ten lines of throwaway code decide whether story 3 is small or grows a JNI
shim.

### 2. Migrate keyring v3 → v4 (desktop, own story)

Desktop only. No Android target, no device needed.

- Replace `keyring = "3"` with `keyring-core` plus the per-platform store
  crates.
- Register the default store once at startup in `lib.rs`.
- Delete the `supported!` / `unsupported!` macros and the `cfg` gates that
  exist only to feed them; `credentials.rs` becomes one code path.
- Report `storage_status` from whether a store is registered, not from `cfg`.

**The migration's real risk is existing users' saved tokens.** v4's platform
stores must read entries that v3 wrote under service `ThinkBrain Notes` with
accounts `profile:{id}` and the legacy per-URL keys, or every current user is
silently signed out. This is an acceptance criterion, not an assumption:
verified by storing a credential with the shipped v3 build and reading it back
with the v4 build on each desktop OS.

### 3. Android credentials and mobile sync triggers

Depends on 1 and 2.

- Add `android-native-keyring-store` under a `cfg(target_os = "android")`
  dependency and register it as the default store on Android.
- Clone and sync a **private** repository on a device.
- Decide and implement mobile sync triggers (below).

## Mobile sync triggers

The story records "no background sync" as a constraint. It is worse than
absent — it is actively wrong on Android.

`registry.rs` runs a sweeper thread on a 500ms tick (`TICK`), firing a round
trip once the vault has been untouched for 30s (`IDLE`) and at most once per
60s (`CAP`). Android freezes the process on background, so those timers do not
merely fail to fire; they fire against a stale clock on resume, and the first
thing a returning user gets is a sync they did not ask for.

Mobile therefore needs explicit triggers rather than idle inference:

- on workspace open,
- on app foreground,
- on explicit user request (pull-to-sync or a sync action),
- on app background, as a best-effort flush before the process is frozen.

`run_trip` already takes everything it needs as arguments, so this is a
scheduling change, not a sync-engine change. The sweeper stays desktop-only;
mobile drives the same core from lifecycle events.

This is separable from credentials and may be split out if story 3 grows.

## Decision-free groundwork, available now

One fix depends on none of the above and improves the shipped Android build
today.

`GitLinkControl.tsx:64-72` computes `canUpdate` without consulting
`status.storage`. On Android the control correctly shows "Sign-in is not
available on this device yet." (via `describeSignInStatus`,
`signInCopy.ts:14-15`) and then offers an enabled **Update sign-in** button
whose only possible outcome is a `sync.auth_required` error. The import dialog
already handles this correctly at `GitLinkImportDialog.tsx:376`; the settings
control should match it.

## Testing

- **Story 2** is fully unit-testable on desktop. `credentials.rs` already
  swaps in an in-memory `HashMap` under `#[cfg(test)]`; that stand-in becomes a
  registered test store rather than a `cfg` branch, which is a strictly better
  shape. Cross-version read-back is a manual per-OS check — it cannot be
  faked, because the thing under test is the real OS store.
- **Story 3**'s device work cannot be unit-tested. What can be tested is the
  store-selection logic (which store is registered for which target) and that
  `storage_status` follows registration rather than `cfg`.
- The `GitLinkControl` fix is a straightforward component test asserting the
  button is disabled when `storage !== "available"`, mirroring the existing
  `GitLinkImportDialog.test.tsx:457` case.

## Risks

- **`android-native-keyring-store` is new** (v1.0.0, July 2026) with little
  field use. Mitigation: it sits behind the `keyring-core` `CredentialStore`
  interface, so replacing it with a bespoke Kotlin plugin later is a store
  swap, not a redesign. Adopting it does not foreclose the rejected option.
- **keyring v4 migration silently signing out existing users.** Covered by the
  read-back acceptance criterion in story 2. This is the highest-consequence
  risk in the whole design, because it lands on desktop users who get no
  benefit from the Android work.
- **`ndk_context` may not be initialised** under Tauri Mobile, adding a JNI
  init shim to story 3. Probed cheaply in story 1 before anything depends on
  the answer.
- **The device clone may simply fail** — aws-lc-sys/rustls, app-private storage
  and `core.worktree`, or gix itself. This is the bet the cross-compile gate
  never actually tested, which is why story 1 exists and comes first.

## Outcome (2026-08-28)

Recorded here because the body above describes the code as it stood when the
decision was taken, and three of its four risks have since been settled by
experiment rather than by argument. The body is left as written — it is the
record of a decision, not a description of the tree.

**The design held. Every rejected option stayed rejected**, and nothing in the
plan had to be re-cut once the device could actually be observed.

- **keyring v4 landed, and its headline risk was real.** v3's
  `linux-native-sync-persistent` is not the keyutils store its name suggests;
  it is keyutils as a cache *plus* dbus-secret-service for durability. Shipping
  on the name match would have signed out every Linux user. Read-back is now
  verified by experiment on Linux, macOS and Windows.
  `supported!`/`unsupported!` are deleted; the passages above describing them
  are historical.
- **`ndk_context` was not initialised**, as the risk anticipated, so the JNI
  shim was needed — and it was needed a story earlier than expected, for
  `rustls-platform-verifier` rather than for credentials. The same shape will
  serve `android-native-keyring-store`.
- **The device clone did fail**, vindicating story 1's existence, but for none
  of the guessed reasons. First TLS, because the platform verifier is never
  initialised under Tauri. Then, after that was fixed, an import that fetched
  and merged perfectly was *deleted* because the push at the end of it failed —
  which is what a public repository looks like. Neither was visible to
  `cargo check`.
- **`run_trip` has since gained a `push_policy` argument**, so the signature
  quoted above is one parameter short of current.

The credential half of the design — `android-native-keyring-store` registered
through `credential_store.rs` — remains unstarted and unchanged. It is now
unblocked: every dependency it named is done.
