# Mobile

> Tauri Mobile epic. **Android is the priority target; iOS follows later.**
> Mobile is a responsive variant of the desktop app, not a separate app. Read
> `plans/app-vision.md` (Technical Stack, Repository Structure) before
> starting any story here.

## Goal

Ship Android builds of the existing desktop app via Tauri v2's mobile
support, with iOS in a later phase. The entire React frontend, `packages/ui`,
CodeMirror 6, and the adapter pattern are reused as-is — phone-first on small
screens, multi-panel on large screens, never a separate app or UI layer.

## Scope

In scope: `tauri android/ios init` scaffolding, responsive breakpoints on
shared `--tn-*` tokens, touch navigation (floating bubbles, hit targets keyed
off `pointer: coarse`), soft "unavailable on mobile" capability reporting for
desktop-only Tauri commands, mobile Tauri config, CodeMirror mobile fixes.

Non-goals: a separate UI layer or `apps/mobile/` directory, separate
adapters, React Native/Expo, per-panel feature parity on phones, a built-in
sync service, tablet-specific layouts, app-store publishing.

## Decisions that survive

- **Managed vaults + clone-first:** native code creates or clones vaults
  under app data; Android never invokes the desktop folder picker (SAF
  returns `content://` URIs the native layers can't use). Direct SAF linked
  folders stay deferred to `android_saf_linked_folders` — research first,
  never `content://` → guessed `/storage/...` paths.
- **Credentials:** keyring v4 + `android-native-keyring-store`; the desktop
  v3→v4 migration is `auto-sync/keyring_v4_migration`.
- **Sync triggers:** Android freezes the process in background, so idle
  timers fire against a stale clock on resume — the shared wall-clock
  schedule replaced `sync.trigger`
  (`docs/superpowers/specs/2026-08-28-sync-schedule-design.md`).
- **Phone chrome:** binding spec is
  `docs/superpowers/specs/2026-08-25-mobile-shell-design.md`;
  `plans/mobile/assets/phone-shell-mockup.html` is a look-and-feel reference
  only.
- **CI caveat:** the gix cross-compile gate is `cargo check -p gix` — no
  link step, no Tauri build. Test on a device for anything native-adjacent.

## Architecture

- Same codebase: mobile is a build target of `apps/desktop/`; `packages/core`
  stays platform-agnostic; no `apps/mobile/`.
- Layout chosen on `coarse pointer && width < 760`; `useShellState` holds the
  state and two thin layouts arrange it; panels, tabs, documents and the
  panel registry are shared untouched.
- Capability gating is a soft compatibility signal, not a security boundary.
- Bring Your Own Sync: Git is the Android v1 sync path (managed vaults are
  private app storage daemons generally can't watch); durable shared-folder
  sync is part of the deferred SAF story. App caches/settings never go in
  the vault.
- Known limitations: Android keyboard/`visualViewport` is mitigated via
  `adjustResize` (device verification remains); CodeMirror IME/touch quirks
  need per-device checks; single webview only (already true on desktop).

## Status

Shipped stories are summarized in `plans/mobile/done-summary.md`.

- ⬜ `android_saf_linked_folders` — SAF linked folders; deferred
  research-first follow-up
- ⬜ `ios_scaffold` — `tauri ios init` (requires macOS); deferred until
  Android is stable
- ❓ Search index (`rusqlite`, bundled SQLite) and file watcher (`notify`)
  on a device — neither observed working nor failing; `notify` sits under
  Android inotify restrictions
