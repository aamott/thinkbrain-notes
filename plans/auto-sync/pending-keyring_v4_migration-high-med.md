# Story: Migrate keyring v3 → v4

**Status:** ⬜ pending · **Urgency:** high · **Difficulty:** med

> Desktop-only groundwork, pulled out of
> `../mobile/pending-mobile_git_access-high-hard.md` so that a keychain
> migration failure and an Android device failure stay distinguishable.
> Design: `docs/superpowers/specs/2026-08-27-android-git-access-design.md`.

## Why

Android needs a credential store. The chosen one,
`android-native-keyring-store`, requires `keyring-core ^1` — keyring **v4**.
This repo pins `keyring = "3"` (`Cargo.toml:47-49`). The migration is the
prerequisite, and it is entirely desktop work that can be verified on desktop.

It also pays for itself independently. keyring v4 moves store selection from a
compile-time feature to an explicit `set_default_store` call at startup, which
lets `credentials.rs` lose the two-body split it carries today.

## Shape

- Replace `keyring = "3"` with `keyring-core` plus the per-platform store
  crates for macOS, Windows and Linux.
- Register the default store once at startup in `lib.rs`, chosen by target.
- Delete the `supported!` / `unsupported!` macro pair
  (`credentials.rs:364-383`) and the `cfg` gates that exist only to feed it —
  `SERVICE`, `STORAGE_PROBE`, and the three-branch `storage_status`.
  `credentials.rs` becomes one code path calling `Entry`.
- `storage_status` reports from whether a store is registered, not from `cfg`.
- `has_keychain` (`workspace_managed.rs:83`) follows registration rather than a
  hardcoded `cfg!`.

The `#[cfg(test)]` in-memory `HashMap` stand-in becomes a registered test
store, which is a better shape than a compile-time branch.

## The risk that matters

**Existing users' saved tokens.** v4's platform stores must read entries that
v3 wrote — service `ThinkBrain Notes`, accounts `profile:{id}`, plus the legacy
per-URL keys — or every current user is silently signed out on upgrade. This
lands on desktop users who get no benefit from the Android work, which makes it
the highest-consequence risk in the whole design.

It cannot be faked in a test, because the thing under test is the real OS
store. It is a manual per-OS check, and it is acceptance, not assumption.

## Acceptance

- [ ] `keyring-core` v1 plus per-platform stores replace `keyring` v3
- [ ] The default store is registered once at startup, selected by target
- [ ] `supported!` / `unsupported!` and their `cfg` gates are deleted, not
      extended; `credentials.rs` has one code path
- [ ] `storage_status` and `has_keychain` follow store registration, not `cfg!`
- [ ] A credential saved by the shipped v3 build is read back by the v4 build
      on **each** of macOS, Windows and Linux
- [ ] Sign-in, save-link, forget and a full round trip still work on desktop
- [ ] `pnpm qa` green

## Not in scope

Android. No `cfg(target_os = "android")` dependency is added here — that is
`../mobile/pending-mobile_git_access-high-hard.md`, and it should be a small
change once this lands.
