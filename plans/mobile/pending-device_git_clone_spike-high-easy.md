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
