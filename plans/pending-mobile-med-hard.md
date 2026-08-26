# Mobile

> Tauri Mobile epic. **Android is the priority target; iOS follows later.**
> Mobile is a responsive variant of the desktop app, not a separate app. Read
> `plans/app-vision.md` (Technical Stack, Repository Structure) before starting
> any story here. Urgency is medium — elevated from low, but balanced against
> in-progress core epics.

## Goal

Ship Android builds of the existing desktop app via Tauri v2's mobile support,
with iOS following in a later phase. Tauri Mobile uses the same webview stack
as desktop, so the entire React frontend, `packages/ui`, CodeMirror 6, and the
adapter pattern are reused as-is. Mobile is a responsive layout of the same
codebase — phone-first on small screens, multi-panel on large screens — not a
separate app, separate UI layer, or separate adapter set.

**Android-first sequencing:** the responsive layout, Tauri mobile config,
Android scaffold, and CodeMirror mobile testing stories ship first. The iOS
scaffold is deferred until Android is stable.

## Scope

In scope:

- `tauri android init` / `tauri ios init` scaffolding for the Android and iOS
  targets
- Responsive layout breakpoints using shared `--tn-*` tokens so the desktop
  shell adapts to phone screens
- Touch-friendly navigation: a bottom shortcut hub whose slots point at
  registered panels and commands, plus touch-sized hit targets keyed off
  `pointer: coarse` rather than viewport width
- Mobile capability compatibility — desktop-only Tauri commands (terminal,
  process-spawn) are reported as unavailable on mobile via platform-aware
  declarations; this is soft compatibility behavior, not security enforcement
- Mobile-specific Tauri config (`tauri.android.conf.json`, `tauri.ios.conf.json`
  if needed)
- CodeMirror 6 mobile testing and fixes (scrolling, IME, touch selection)

Non-goals (deferred or out of scope for this epic):

- A separate UI layer or separate app — there is no `apps/mobile/` directory
- Separate platform adapters — mobile reuses the same Tauri adapters as desktop
- React Native / Expo — not used; Tauri Mobile is webview-based
- feature parity with every desktop panel on phone screens
- cloud sync / built-in sync service (Bring Your Own Sync applies)
- tablet-specific layouts (phone-first; tablet falls out of responsive design)
- publishing to app stores (build/ship pipeline is a later concern)

## Where it actually stands (observed on an Android device, 2026-08-23)

The app **compiles, installs and launches on Android**. That is further than
this epic's status list suggests, and further than a reading of the repo
suggests — several items below were already built and never ticked. What
follows is what a person found by running it, plus what the code says about
why.

### Already done, and this epic said otherwise

- **The Android scaffold is done.** `apps/desktop/src-tauri/gen/android/`
  holds 49 tracked files from `tauri android init` (commit `58dfd14`), and the
  device run confirmed installation, launch and initial UI rendering. See
  `mobile/done-android_scaffold-med-easy.md`.
- **Mobile capabilities are declared.** `src-tauri/capabilities/mobile.json`
  covers `android`/`iOS` for `main` and `workspace-*` windows.
- **Desktop-only dependencies are already gated.** `tauri-plugin-updater` and
  `keyring` sit behind
  `cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))`
  in `Cargo.toml`, and `credentials.rs` splits on the same condition with
  `supported!`/`unsupported!` macros. Nothing has to be untangled for the build
  to work — it already does.
- **Some responsive work exists**: `max-[760px]:` breakpoints in
  `DesktopShell`, `TitleBar`, `Popout` and `ResizeHandle`; `useCoarsePointer.ts`
  (`matchMedia("(pointer: coarse)")`, because width alone cannot tell a phone
  from a narrow panel); and `MetadataBottomSheet.tsx`, which tracks
  `window.visualViewport` around the soft keyboard.

### The blocker: managed Android workspace access must be built

On device, no workspace can currently be opened — with or without git. The
cause is structural rather than a picker bug:
`workspaceAdapter.pickWorkspaceDirectory` asks `tauri-plugin-dialog` for
`open({ directory: true })`, which Android does not support, while SAF returns a
`content://` tree URI and the native workspace, watcher, search and sync layers
require canonical filesystem `Path`s.

**Decision approved 2026-08-25:** Android v1 uses managed vaults plus clone-first
onboarding. Native code creates or clones vaults beneath a dedicated app-data
root; mobile offers Create vault and Clone from Git and does not invoke Open
Folder. Desktop keeps its existing picker flows. Managed-vault creation shows a
one-time uninstall-risk notice, but the app does not display a persistent
"unprotected" warning or pretend it can detect external backups.

Direct SAF linked folders are deferred to
`mobile/pending-android_saf_linked_folders-low-hard.md`. That research-first
story will re-check current platform/plugin support and compare a persisted SAF
tree plus local mirror/reconciliation against a full storage abstraction. It
must not convert `content://` URIs into guessed `/storage/...` paths.

### Git specifically

- **gix cross-compiles** for `aarch64-linux-android` and `aarch64-apple-ios`,
  gated in CI. But the gate is `cargo check -p gix` on that one package, by
  design — CI's own comment says Tauri's mobile build "needs an SDK, a linker
  and a generated project, none of which this gate is asking about." gix has
  never been *run* on a device.
- **Credentials do not persist.** On Android `credentials.rs` compiles to stubs
  that return `sync.auth_required` — "Sign-in is not available on this device
  yet." Public clones would work; private ones have nowhere to keep a token.
  The alternative (an encrypted app-data fallback) is the same unmade decision
  `plans/pending-extensions-low-hard.md` records for extension secrets, and
  mobile is what forces it.
- **Foreground-only.** `auto-sync/done-mobile_cross_compile-med-easy.md` says
  this constraint was "documented for the mobile epic"; it was not, so it is
  recorded here. Android does not let an app sync on idle the way the desktop
  triggers assume, so mobile needs its own answer about when a round trip runs.

### The UI is not usable on a phone yet

- **Very unoptimised generally.** The `max-[760px]:` work covers the shell
  chrome, not the surfaces inside it. The binding design is
  `docs/superpowers/specs/2026-08-25-mobile-shell-design.md`, implemented by
  `docs/superpowers/plans/2026-08-25-mobile-shell.md`.
  `plans/mobile/assets/phone-shell-mockup.html` is a **look-and-feel
  reference**, not a source of truth: a mockup carries its own token namespace
  and cannot be copied into the app's `--tn-*` utilities.
- **The activity bar is wrong for touch.** `ActivityBar.tsx` is a 53-line rail
  of icon-only buttons — the labels exist as `aria-label` only. On phone it is
  replaced by a universal header, a bottom shortcut hub and an 86%-width
  labeled drawer rendering the same `useLeftPanelContributions()` the rail
  reads, so entries, active state and badges keep one definition.
- **Right panels are unreachable on a phone.** `TitleBar.tsx:170` hides every
  right-panel button below 760px, so outline, properties, backlinks and the
  assistant have no mobile entry point at all. An inspector sheet behind the
  header's `⋯` owns this.
- **The soft keyboard.** `windowSoftInputMode="adjustResize"` shipped and
  editing was verified on an emulator, so tauri-apps/tauri#10631 no longer
  gates mobile editing. Residual risk: emulator-only verification, and a
  bottom-anchored hub that must track `window.visualViewport` rather than
  float over the keyboard.

### Not yet known

Nobody has tried the search index (`rusqlite`, bundled SQLite) or the file
watcher (`notify`) on a device. Both are in the unconditional dependency block
with no Android handling, and Android restricts inotify watches; neither has
been observed working or failing.

## Architecture Decisions

### Same codebase as desktop

Tauri v2 Mobile uses the same webview as desktop, so the entire React frontend,
`packages/ui`, CodeMirror 6, and the adapter pattern are reused without
duplication. Mobile is a build target of `apps/desktop/`, not a separate app.
No `apps/mobile/` directory is created. The hub-and-spoke contract from
`app-vision.md` is unchanged — `packages/core` stays platform-agnostic, and
`apps/desktop` provides the Tauri adapters that both desktop and mobile builds
use.

### Responsive layout

Mobile switches between desktop and mobile layouts with shared `--tn-*` tokens
within the same shell.
Phone-first on small screens (single panel, bottom shortcut hub), multi-panel on
large screens (current desktop layout). There is no separate screen tree or
navigation stack: `useShellState` holds the state and two thin layout components
arrange it, chosen on `coarse pointer && width < 760`. Panels, tabs, documents
and the panel registry are shared untouched.

### Capability gating

Some Tauri commands are desktop-only (terminal, process-spawn). The trusted
extension system uses platform-aware capability declarations as soft
compatibility signals (already in the `extensions` plan): mobile builds may
report features as unavailable and warn or disable their UI paths. These
declarations are not security enforcement, a sandbox, or a hostile-extension
boundary.

### Known limitations

- **Android keyboard / `visualViewport`** (tauri-apps/tauri#10631): mitigated,
  not open. `windowSoftInputMode="adjustResize"` shipped with
  `mobile/done-codemirror_mobile_testing-med-med.md` and editing was verified on
  an emulator. What remains is device verification and keeping bottom-anchored
  chrome out of the keyboard's way.
- **CodeMirror 6 mobile quirks**: scrolling on Android, IME composition
  (Gboard), and touch-based text selection on iOS need explicit testing and
  likely fixes. `EditorView.EDIT_CONTEXT = false` may be required on Android.
- **Single webview only**: Tauri Mobile supports a single webview. This is not
  a problem for us — the desktop app is already single-webview.

### Core adapter follow-up

The cross-cutting adapter-interface item in `plans/maintenance/` may improve
separation and testability, but it is not a blanket blocker for this Phase 2 epic.
Mobile reuses the current Tauri adapters; re-home any broad refactor before implementation
rather than creating mobile-specific adapters.

### Bring Your Own Sync

No hosted cloud service is added. Git is the direct Android v1 sync path because
managed vaults are private app storage. OneDrive, Syncthing and similar tools
remain passive from the app's perspective but generally cannot watch that
private directory under Android scoped storage; durable shared-folder sync is
part of the deferred SAF story. The app does not infer or warn continuously
about external protection state. App caches/settings never go in the vault.

## Dependencies

- Existing Tauri adapter boundaries; the optional cross-cutting adapter cleanup remains tracked in `plans/maintenance/` and must be re-homed if it grows.
- `packages/core` business logic (note model, frontmatter, markdown parsing,
  settings shapes) — already present and platform-agnostic.
- `packages/ui` and the React frontend — already shared, no mobile-specific
  work needed beyond responsive layout.

No other epic blocks this one. Resolve only adapter gaps actually proven by mobile implementation.

## Status

**Phase 1 — Android (medium urgency):**

Ordered by what blocks what. The first item gates every other one: there is no
point tuning a layout for a workspace that cannot be opened.

- ✅ **Managed workspace access** — Android v1 creates or clones real-path
  vaults beneath app data. Native managed-vault commands, capability-gated
  UI, clone-first onboarding, and one-time uninstall notice all shipped.
  `mobile/done-android_workspace_access-high-hard.md`
- ⬜ Git clone as the mobile way in, followed by Android Keystore-backed shared
  secret storage for private repositories —
  `mobile/pending-mobile_git_access-high-hard.md`
- ⬜ Phone shell chrome — headless shell state, form-factor gate, header,
  drawer, shortcut hub, tab-switcher and inspector sheets —
  `mobile/pending-phone_shell_chrome-med-hard.md`
- 🟨 Phone surface fixes — popout width, bottom-edge contention, keyboard
  inset, `pointer-coarse:` sizing —
  `mobile/pending-phone_surface_fixes-med-med.md`
- ✅ `tauri android init` — the scaffold is committed under
  `src-tauri/gen/android/`, and the app builds, installs, launches and renders
  on a device — `mobile/done-android_scaffold-med-easy.md`
- 🟨 Mobile Tauri config — `capabilities/mobile.json` exists and the
  desktop-only dependencies are gated; the soft "unavailable on mobile"
  reporting for desktop-only commands is not built —
  `mobile/pending-mobile_tauri_config-med-easy.md`
- ✅ CodeMirror mobile testing — editing verified on Android emulator,
  `windowSoftInputMode="adjustResize"` added, tap-below-last-line fixed —
  `mobile/done-codemirror_mobile_testing-med-med.md`
- ⬜ Reuse current Tauri adapters; raise only proven cross-cutting adapter gaps through maintenance
- ❓ Search index (`rusqlite`) and file watcher (`notify`) on a device —
  neither observed working nor failing
- ⏸️ SAF linked folders — deferred research-first follow-up after managed
  vaults are stable — `mobile/pending-android_saf_linked_folders-low-hard.md`

**Phase 2 — iOS (low urgency, deferred until Android is stable):**

- ⬜ `tauri ios init` — scaffold iOS target (requires macOS) — `mobile/pending-ios_scaffold-low-easy.md`
