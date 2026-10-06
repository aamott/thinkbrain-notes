# Mobile Epic — Completed Work

Android v1 is a managed-vault model: the app creates or clones vaults beneath
app-private storage, clone-first over Git, with desktop folder-picking kept
unchanged. Verified on a Pixel 7a emulator and on hardware 2026-08-27.

## Platform & access

- `android_scaffold` — `tauri android init` scaffold committed under
  `src-tauri/gen/android/`; builds, installs, launches, renders on device.
- `android_workspace_access` — managed-vault root with create/list/resolve and
  strict containment; `workspace_access_capabilities` gates the renderer
  (Android: Create/Clone; desktop: Open Folder); managed Git import reuses the
  desktop worker; one-time uninstall notice on creation.
- `mobile_tauri_config` — `platform_capabilities` command + renderer store;
  commands declare `requires` and degrade to "unavailable" on mobile
  (`toggle-bottom-panel` needs `canSpawnProcess`). Soft signals, not a sandbox.
- `android_tls_platform_verifier` — `rustls-platform-verifier` JNI init from
  `MainActivity.onCreate`; Gradle locates the crate's bundled `.aar` (must be
  requested as `@aar`). Unblocked all HTTPS on Android.
- `device_git_clone_spike` — proved gix actually runs on a device, gating the
  keyring v4 migration and private-Git verification.

## Sync

- `mobile_sync_triggers` — investigated lifecycle triggers; superseded by the
  shared wall-clock schedule (see sync-schedule design spec).
- `frozen_sync_blocks_the_next_one` — a frozen claim expires after ten minutes
  via wall-clock start + generation; the per-workspace lane serializes
  takeover.

## Editor & shell

- `codemirror_mobile_testing` — `adjustResize`, tap-below-last-line fix, and
  emulator-verified editing with a managed vault.
- `phone_shell_chrome` — headless `useShellState`; `PhoneShell` picks on
  coarse pointer + narrow viewport; header tabs, drawer, shortcut hub,
  tab-switcher grid, inspector sheet. Device-verified.
- `phone_surface_fixes` — full-bleed popouts via `--tn-shell-popout-left`,
  hub owns the bottom edge and hides under the soft keyboard, `pointer-coarse:`
  touch sizing. Device-verified, including keyboard inset.

## Open follow-ups

Anonymous public clone on physical hardware and the desktop UI credential pass
remain (`mobile/android_anonymous_clone`, `auto-sync/keyring_v4_migration`);
SAF linked folders are deferred research (`mobile/android_saf_linked_folders`);
iOS is deferred entirely (`mobile/ios_scaffold`).
