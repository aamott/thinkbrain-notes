# Mobile Epic — Completed Work

Android v1 is a managed-vault model: the app creates or clones vaults beneath
app-private storage, clone-first over Git, with desktop folder-picking kept
unchanged.

## Platform & access

- `android_scaffold` — `tauri android init` scaffold committed under
  `src-tauri/gen/android/`; builds, installs, launches, renders on device.
- `android_workspace_access` — managed-vault root with create/list/resolve
  and strict containment; `workspace_access_capabilities` gates the renderer
  (Android: Create/Clone; desktop: Open Folder); managed Git import reuses
  the desktop worker; one-time uninstall notice on creation.
- `mobile_tauri_config` — `platform_capabilities` command + renderer store;
  commands declare `requires` and degrade to "unavailable" on mobile
  (`toggle-bottom-panel` needs `canSpawnProcess`). Soft signals, not a
  sandbox.
- `android_tls_platform_verifier` — `rustls-platform-verifier` JNI init from
  `MainActivity.onCreate`; Gradle locates the crate's bundled `.aar` (must be
  requested as `@aar`). Unblocked all HTTPS on Android.
- `device_git_clone_spike` — proved gix actually runs on a device, gating the
  keyring v4 migration and private-Git work. The TLS-verifier panic it caught
  is why the `cargo check -p gix` CI gate is not enough for native-adjacent
  work.

## Sync

- `mobile_sync_triggers` — investigated lifecycle triggers; superseded by the
  shared wall-clock schedule (see sync-schedule design spec).
- `frozen_sync_blocks_the_next_one` — a frozen claim expires after ten
  minutes via wall-clock start + generation; the per-workspace lane
  serializes takeover.
- `android_anonymous_clone` — imports keep a fetched vault when the optional
  post-import push can't land, and tell the user it is not linked both ways;
  private Git access covered too. The fix is shared with desktop.

## Editor & shell

- `codemirror_mobile_testing` — `adjustResize`, tap-below-last-line fix, and
  editing verified on an emulator with a managed vault.
- `phone_shell_chrome` — headless `useShellState`; `PhoneShell` picks on
  coarse pointer + narrow viewport; header tabs, drawer, tab-switcher grid,
  inspector sheet.
- `phone_surface_fixes` — full-bleed popouts via `--tn-shell-popout-left`,
  bottom-edge contention resolved, `pointer-coarse:` touch sizing, keyboard
  inset handled.
- `floating_bubbles` — contextual bubbles (⌂ Home, + New note, ⋮ Actions)
  replaced the bottom hub; the ☰ main menu moved into the header; bubbles
  hide under the soft keyboard; `ui.mobileBubbleLabels` label setting.

## Open follow-ups

SAF linked folders are deferred research (`android_saf_linked_folders`); iOS
is deferred entirely (`ios_scaffold`). The search index (`rusqlite`) and file
watcher (`notify`) have never been observed on a device.
