# Story: Git Works on a Phone — Private Clones and Where the Token Lives

**Status:** ⬜ pending · **Urgency:** high · **Difficulty:** hard

> Cloning is the most likely way a vault ever arrives on a phone, because it is
> the one way that needs no folder picker — see
> `done-android_workspace_access-high-hard.md`. That makes this story part of
> onboarding rather than an advanced feature.
>
> Re-cut 2026-08-27 against
> `docs/superpowers/specs/2026-08-27-android-git-access-design.md`. Two pieces
> were split out: the device spike that gates this
> (`pending-device_git_clone_spike-high-easy.md`) and the keyring migration it
> depends on (`../auto-sync/pending-keyring_v4_migration-high-med.md`).

## What is already true

More than the epic's status list suggests.

- **The Android scaffold is real and committed.** `gen/android/`, package
  `com.thinkbrain.notes`, `minSdk 24` / `targetSdk 36`, all four ABIs, a custom
  Gradle `RustPlugin` driving the per-ABI Rust build. `release.yml` can already
  produce a signed AAB and APK behind `ANDROID_RELEASE_ENABLED`.
- **The managed clone path already exists.**
  `import_managed_workspace_from_git_link` (`sync/import.rs:239`) reuses the
  desktop import worker — `prepare_import` → `bootstrap` → `round::run_trip` —
  with the same `sync://import` event and opaque request id. **The "reuse
  rather than duplicate" criterion is already met in code**; it has simply
  never been exercised on a device.
- **The sync core is platform-clean.**
  `run_trip(repo, vault, destination, profile_id, on_phase)` (`round.rs:128`)
  takes no engine and no OS assumptions. The whole Rust tree holds two `cfg`
  sites: the mobile entry point and the updater gate. Credentials entangle at
  exactly two places — `credentials::provide` (`network.rs:92`, `push.rs:261`)
  and `credentials::with_profile` (`round.rs:160,214`).
- **The import dialog already tells the truth.**
  `GitLinkImportDialog.tsx:376,381-383` hides the sign-in fields and shows
  `storageMessage` when storage is not available.
- **gix has never been run on a device.** The CI gate is `cargo check -p gix`,
  by design. See `pending-device_git_clone_spike-high-easy.md`.

## The blocker: credentials — decided

Android has no credential store registered, so `keyring_core::Entry::new`
fails with `NoDefaultStore` and `credentials.rs` reports `sync.auth_required`.
Public repositories can be cloned; private ones cannot, and most people's notes
are private.

(Until 2026-08-28 this happened through a `cfg`-gated `unsupported!` stub. The
keyring v4 migration deleted that whole code path: there is now one body, and
"can this device keep a sign-in" is a runtime question about what
`credential_store::register()` managed to register. That is what makes the
remaining work a single `cfg(target_os = "android")` dependency plus a JNI
hook, rather than a second code path.)

**Decision (drafted 2026-08-27, confirmed 2026-08-28): keyring v4 plus
[`android-native-keyring-store`](https://crates.io/crates/android-native-keyring-store).**

It comes from `open-source-cooperative`, the same org that maintains the
`keyring` crate already in this build, and stores credentials in SharedPreferences
encrypted under a dedicated Android Keystore entry. It supports API 24+,
matching our `minSdk` exactly. This is the story's original "encrypted app-data,
with the key from Keystore" candidate with the custody question answered: we do
not write or own the encryption.

Rejected, and why:

- **A bespoke Kotlin plugin over Keystore** — correct, but it means owning a
  JNI surface and a second credential abstraction desktop does not share. More
  than the problem costs, and still available later as a store swap.
- **A hand-rolled encrypted file** — the extensions story forbids it in as many
  words: "never invent plaintext or improvised encryption."
- **`tauri-plugin-keystore`** — requires API 28 against our `minSdk 24`,
  assumes enrolled biometrics with no preflight check, and keeps
  `credentials.rs` split in two forever.
- **No stored token, public repos only** — named so it is rejected
  deliberately rather than by default. It is the least useful outcome.

This decision serves the extensions epic's secret storage too: one `Entry`-shaped
boundary, one namespace convention, every platform included. See
`../extensions/pending-extension_secret_storage-med-hard.md`.

## The other constraint: no background sync

Worse than absent — actively wrong on Android. `registry.rs` runs a sweeper
thread on a 500ms tick (`TICK`), firing a round trip after 30s idle (`IDLE`),
capped at once per 60s (`CAP`). Android freezes the process on background, so
those timers do not merely fail to fire; they fire against a stale clock on
resume, and a returning user gets a sync they did not ask for.

Mobile needs explicit triggers instead of idle inference: on workspace open, on
foreground, on explicit user request, and a best-effort flush on background.
`run_trip` already takes everything it needs as arguments, so this is a
scheduling change rather than a sync-engine change — the sweeper stays
desktop-only and mobile drives the same core from lifecycle events.

Separable from credentials; split this out if it grows.

## Dependencies

**All three are now done, so this story is unblocked.**

1. `pending-device_git_clone_spike-high-easy.md` — ✅ run 2026-08-27.
2. `pending-android_tls_platform_verifier-high-med.md` — ✅ fixed. The JNI shim
   in `src-tauri/src/android_tls.rs` is the pattern to copy for the credential
   store, since Tauri does not populate `ndk-context` either.
3. `../auto-sync/pending-keyring_v4_migration-high-med.md` — ✅ v4 shipped and
   read-back verified on Linux, macOS and Windows. One acceptance item is still
   open there (a sign-in/forget round trip through the running desktop app) but
   it does not block this.

Also cleared on the way, and not originally foreseen:
`pending-android_anonymous_clone-high-med.md` — a public repository now clones
on a device. The import used to be rolled back whenever the push at the end of
it failed.

## Acceptance

- [ ] `android-native-keyring-store` registered as the default store on Android
      under a `cfg(target_os = "android")` dependency
- [ ] A **private** repository is cloned on a real device
- [ ] A round trip (fetch, merge, push) completes on a real device
- [ ] Mobile sync triggers are defined and implemented, and do not rely on
      background execution Android will not grant
- [ ] Where the token lives is written down with its reasoning and serves the
      extensions epic's secret storage
- [ ] The desktop import flow is reused rather than duplicated — already true
      in code; confirmed on a device
- [ ] `pnpm qa` green

## Done here already

- [x] `GitLinkControl` no longer offers an Update sign-in button that cannot
      succeed on a device without a credential store (`canUpdate` now consults
      `status.storage`, matching `GitLinkImportDialog.tsx:376`)
