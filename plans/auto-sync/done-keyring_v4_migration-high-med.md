# Migrate keyring v3 → v4

**Status:** ✅ done · **Urgency:** high · **Difficulty:** med

Android Git support required `keyring-core` v4 and a real Android credential
store. The migration is implemented in
`apps/desktop/src-tauri/src/credential_store.rs`.
The platform stores and v3→v4 compatibility were checked against real stores
on Linux, macOS and Windows; Linux also has a separate-process probe. Android
private sync, restart persistence and credential deletion were verified on an
emulator (see the Android Git access record). Automated Rust/frontend QA
passed when the migration landed, and the desktop settings UI save/read/forget
pass completed manually.

## Shipped

- Replaced `keyring = 3` with `keyring-core` and per-platform backends, selected
  once at startup. Android uses `android-native-keyring-store`; iOS remains
  unsupported until its protected-keychain path is implemented.
- Existing credentials remain readable using the same service and account
  names. Tests use keyring's registered mock store and exercise the production
  credential path.
- Removed the old supported/unsupported credential code split.

Known Linux regression: without D-Bus, the v4 Secret Service backend cannot
read the keyutils cache that v3 could use in headless sessions. No composite
backend was added.

## Verified

- [x] Save, read back and forget a sign-in through the desktop settings UI.
