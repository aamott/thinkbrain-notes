# Story: Migrate keyring v3 → v4

**Status:** 🟨 wip · **Urgency:** high · **Difficulty:** med

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

## What shipped (2026-08-27)

- `keyring = "3"` replaced by `keyring-core = "1"` plus one store crate per
  target, chosen explicitly in `Cargo.toml` rather than by feature unification.
- New `src/credential_store.rs` registers the store once in `run()`, and
  answers `is_available()` from what was actually registered.
- `supported!` / `unsupported!` and every `cfg` that fed them are **deleted**.
  `credentials.rs` went from 622 lines with two compiled bodies to 506 with
  one. `SERVICE` and `STORAGE_PROBE` are no longer target-gated.
- `storage_status` and `has_keychain` now report registration rather than
  `cfg!`, so a keychain that fails to start reads as absent instead of
  present-but-broken.
- Tests register `keyring_core::mock::Store` instead of a bespoke `#[cfg(test)]`
  `HashMap`, so they exercise the shipped code path and swap only the backend.

413 Rust tests pass; `pnpm qa` green.

## The Linux backend: two wrong answers before the right one

This is the part worth reading, because the obvious choice was wrong twice.

v3 was built with `linux-native-sync-persistent`. That reads like "the Linux
native store", and the v4 crate with the matching name is
`linux-keyutils-keyring-store`. **Both of those inferences are wrong.**

In keyring v3 that feature expands to `linux-native` + `sync-secret-service` —
a *pair* of stores. keyutils is only a cache for headless processes; the
**Secret Service** is what survives a reboot. And `sync-secret-service` is
`dbus-secret-service`, the blocking libdbus crate, not zbus.

Verified by experiment rather than by reading, using the app's exact service
name and account format:

| store used to read | result |
|---|---|
| `linux-keyutils-keyring-store` (name-matched guess) | **NoEntry** |
| same, with v3's `keyring-rs:` key prefix configured | **NoEntry** |
| `zbus-secret-service-keyring-store` | reads it |
| `dbus-secret-service-keyring-store` (chosen) | reads it |

A control confirmed v3 entries do persist across processes, so the failures
above were real and not an artefact of the probe.

**Had this shipped on the name match, every Linux user would have been silently
signed out.** That is precisely the risk this story was split out to contain.

`dbus-` is chosen over `zbus-` because the sync worker calls credentials from a
plain blocking thread; both read the same data, but the zbus store drags an
async runtime into that path for no benefit. `crypto-rust` matches v3 exactly,
so no new system dependency appears.

### Known regression

v4 ships no combined keyutils+Secret-Service store. A headless Linux session
with no D-Bus that previously read from the keyutils cache will now report no
credential store rather than finding a cached secret. Reproducing v3's pair
would mean writing a composite store by hand; not done, and not obviously
worth it.

## Acceptance

- [x] `keyring-core` v1 plus per-platform stores replace `keyring` v3
- [x] The default store is registered once at startup, selected by target
- [x] `supported!` / `unsupported!` and their `cfg` gates are deleted, not
      extended; `credentials.rs` has one code path
- [x] `storage_status` and `has_keychain` follow store registration, not `cfg!`
- [x] A credential saved by the shipped v3 build is read back by the v4 build
      on **Linux** — verified with a two-crate probe against the real store
- [x] The same read-back on **macOS** — probe run 2026-08-28, v4 read the
      credential v3 wrote
- [x] The same read-back on **Windows** — probe run 2026-08-28, same result
- [x] The probe itself is trustworthy — reproduces the Linux PASS and produces
      a FAIL against the known-wrong store
- [x] Saving and forgetting a sign-in work against the **real** OS store —
      `cargo run -- roundtrip` in `tools/keyring-migration-probe`. PASS on
      Linux 2026-08-28. This closes a gap the unit tests cannot: they register
      `keyring_core::mock`, so before this the path to an actual keychain had
      never been executed by a test on any platform. The check that matters is
      the last one — a delete that reports success while leaving the secret
      readable is the failure worth catching, and the probe was confirmed to
      report FAIL when the delete is skipped
- [ ] The same round trip through the running app's UI on desktop — the probe
      covers the store, not the wiring between the settings form and it. One
      manual pass on any desktop closes this; a git clone through the app on
      Windows (2026-08-28) already covers the read side
- [x] `pnpm qa` green

## What the crate sources predict for macOS and Windows

Read before running anything, so a surprise is recognisable as a surprise.
This is source reading, not evidence — the Linux lesson was that names
mislead, so this time the *keying code* was read rather than the crate names.

**Windows.** v3 builds the Credential Manager `target_name` as
`format!("{user}.{service}")` (`keyring-3.6.3/src/windows.rs:379`). v4 builds
it as `format!("{}{user}{}{service}{}", delimiters[0], delimiters[1],
delimiters[2])` (`windows-native-keyring-store-1.1.0/src/cred.rs:53`), and the
documented defaults are an empty prefix, an empty suffix and `"."` as the
delimiter. Those produce the identical string. **Predicted: reads back.** The
prefix is configurable, so this is only true while we leave it unset — v4's
docs advertise the prefix as a feature, and setting one later would orphan
every existing credential.

**macOS.** v3 uses the *legacy* file-based keychain API — `SecKeychain` and
`find_generic_password` from `security_framework::os::macos` — storing the user
in `account` and the service in `name`, in the User (login) keychain. v4's
`apple-native-keyring-store` offers two modules, and the `keychain` feature we
enabled is explicitly the legacy store, using `account` for the user and
`service` for the service in the User keychain by default, with no prefix or
concatenation. **Predicted: reads back.** The trap avoided here was the
`protected` module, which is the modern data-protection store — a different
place entirely.

Neither prediction was worth shipping on by itself, so both were run.

**Both passed on 2026-08-28**, on real hardware, matching the predictions: v4
read back the credential v3 wrote on macOS and on Windows. All three shipping
platforms are now verified by experiment rather than by inference, which is the
bar this story was created to meet. `tools/keyring-migration-probe` can be
deleted whenever it stops being useful as a regression check.

### One macOS-specific caveat when interpreting the result

The login keychain binds an ACL to the application that created an item, so a
read from a *different* binary can prompt for the login password. The probe
writes and reads from the same binary to avoid this, but if macOS prompts
anyway, that is the ACL check and not a migration failure — allow it and judge
the probe by the line it prints afterwards.

## The probe

Committed at `tools/keyring-migration-probe/`. One crate depending on **both**
keyring generations at once — possible because v3 is the crate `keyring` and v4
is `keyring-core` plus a store — so a single binary writes with v3 and reads
with v4. Its platform stores mirror `credential_store.rs` exactly; if those
ever diverge, the probe stops testing what we ship.

```
cd tools/keyring-migration-probe
cargo run -- write     # v3 stores a credential
cargo run -- verify    # v3 reads it back (control), then v4 reads it
cargo run -- clean     # remove it again
```

Three separate processes on purpose: a single run could be answered from an
in-process cache and prove nothing about what is persisted.

It prints `PASS` or `FAIL` and says which. The control step exists because a
bare v4 failure is ambiguous — it could mean v4 looks in the wrong place, or
that nothing was ever stored — and it is what made the Linux result
trustworthy.

**Verified as a harness on Linux, in both directions:** `PASS` against the
shipped `dbus-secret-service-keyring-store`, and `FAIL — No matching credential
found` when pointed at `linux-keyutils-keyring-store`, the wrong store from the
investigation above. A probe that can only print `PASS` would be worse than no
probe, so it was checked against a known failure before being handed over.

Delete the crate once macOS and Windows are both recorded below.

## Also fixed here: iOS was declared and could not have compiled

`apple-native-keyring-store` was pulled in under `cfg(any(macos, ios))` with
`features = ["keychain"]`. On iOS that crate compiles the `keychain` module out
entirely and raises a `compile_error!` demanding `protected` instead, so the
declaration would not have given iOS a credential store — it would have failed
the build with a confusing message. Both the dependency and `platform_store`
are now macOS-only, and iOS falls through to the `None` arm, which is the
honest answer until someone actually ships it. Found by reading the crate for
the prediction above; there is no iOS target in the repo, so nothing was broken
in practice.

## Not in scope

Android. No `cfg(target_os = "android")` dependency is added here — that is
`../mobile/pending-mobile_git_access-high-hard.md`, and it should be a small
change once this lands.
