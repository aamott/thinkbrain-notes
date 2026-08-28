# Story: Prove gix Actually Runs on a Device

**Status:** ⬜ pending · **Urgency:** high · **Difficulty:** easy

> Spike. The output is an answer, not code we keep. Gates
> `pending-mobile_git_access-high-hard.md` and
> `../auto-sync/pending-keyring_v4_migration-high-med.md`.
> Design: `docs/superpowers/specs/2026-08-27-android-git-access-design.md`.

## Why this comes first

Everything in the mobile git epic assumes gix works on Android, and nothing has
proven it. The CI gate is `cargo check -p gix` for `aarch64-linux-android` —
one package, no link step, no Tauri build, as `ci.yml`'s own comment says. gix
has never been **run** on a device: not a clone, not a fetch, not a merge.

It is cheap, it needs no decisions, and it either confirms the cross-compile
bet in practice or turns the whole git-access story into something else.

## What to try

Clone a small **public** repository into a managed vault via
`import_managed_workspace_from_git_link` (`sync/import.rs:239`) — the existing
worker, unchanged. Emulator first (`Pixel_7a` AVD), then hardware.

This exercises, in one pass:

- gix over rustls/aws-lc-sys on a real Android runtime,
- the managed-vault import worker end to end,
- `bootstrap`'s `core.worktree` rewrite against app-private storage,
- `sync://import` progress events reaching the phone shell.

Build with `pnpm android:dev` (never Android Studio's build button — it calls
Gradle directly and panics without the Tauri CLI's coordination server).

## The second probe, riding along

Does `ndk_context`'s application context arrive initialised under Tauri Mobile?
`android-native-keyring-store` requires it bound before any store is created.
`android-activity` should provide it; "should" is what the cross-compile gate
already taught us to distrust. Ten throwaway lines settle whether the Android
credential story needs a JNI init shim.

## Findings (2026-08-27, Pixel_7a emulator, x86_64 debug APK)

**The build works. The clone does not.** The spike paid for itself.

What passed, and is now known rather than assumed:

- The **full Tauri Android build links**, gix and rustls included — something
  `cargo check -p gix` never proved. `pnpm desktop:tauri android build --debug
  --apk --target x86_64` produced a working APK.
- The app installs, launches and renders the phone shell with no panic;
  `libthinkbrain_notes_desktop_lib.so` loads cleanly.
- **Managed vaults work.** An existing vault at
  `/data/data/com.thinkbrain.notes/vaults/test` opens, lists and browses.
- **Clone-first onboarding is wired.** The workspace switcher offers "Bring in
  from Git link…"; the dialog resolves the managed destination, derives the
  child folder name, and honestly reports "Sign-in is not available on this
  device yet."

**The blocker, and it is not credentials:**

```
thread 'reqwest-internal-sync-runtime' panicked at
  rustls-platform-verifier-0.7.0/src/android.rs:90:
  Expect rustls-platform-verifier to be initialized
```

`gix-transport → reqwest 0.13.4 → rustls-platform-verifier 0.7.0`. On Android
that crate validates certificates through the JVM's Trust Manager, so it needs
a Kotlin component in the Gradle build and a one-time JNI init before any
networking. Neither exists here, so **every TLS connection panics** — public
and private repositories alike.

This is more fundamental than the credential question the epic treats as the
blocker. No TLS means no clone at all.

The app degrades honestly — no crash, and it recovers — but the message it
shows ("Could not reach the place these notes sync to. Check the git link and
your connection") misdiagnoses a missing platform init as a network fault.

Tracked as `pending-android_tls_platform_verifier-high-med.md`. **Fixed and
verified the same session** — the panic is gone and the clone now reaches the
credential stage.

**The next blocker, found immediately behind it:** gix does not accept a
credential helper that returns nothing. A public clone fails with
`sync.credentials_invalid` because anonymous access means *not configuring a
helper*, not configuring one that declines. Tracked as
`pending-android_anonymous_clone-high-med.md`, which now gates this spike's
remaining acceptance.

The emulator's network is fine (`ping github.com` succeeds), so nothing here is
an environment artefact.

**Bonus finding:** bundled themes do not resolve on Android — logcat repeats
`[themes] resource path not found for <name>.tbtheme.json` for all eight
presets. Unrelated to git; recorded so it is not lost.

**On `ndk_context`: answered, and negatively.** `ndk-context` is not in the
dependency tree at all, and neither `tao` nor `wry` initialise it. Tauri does
**not** populate it. The TLS fix therefore had to take its JNI handles from
Java, via a native method called from `MainActivity.onCreate`.

That is a direct hit on the credential design: `android-native-keyring-store`
requires the `ndk-context` application context, so it will need the same
treatment. The pattern to copy is now in the repo — `src/android_tls.rs` plus
the `MainActivity` hook.

## Acceptance

- [ ] A public repository clones into a managed vault on an Android emulator
- [ ] The same clone succeeds on physical hardware
- [ ] Notes from the cloned vault open, edit and save
- [ ] Findings recorded here, including whether `ndk_context` is pre-initialised
- [ ] If the clone fails: the failure is characterised (TLS? storage? gix?) and
      `pending-mobile_git_access-high-hard.md` is re-cut against it

## Not in scope

Private repositories, token storage, sync triggers. Those depend on this
answering yes first.
