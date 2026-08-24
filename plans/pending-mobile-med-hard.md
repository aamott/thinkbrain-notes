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
- Touch-friendly navigation (bottom tabs, swipe gestures, 44px touch targets)
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

- **The Android scaffold is committed.** `apps/desktop/src-tauri/gen/android/`
  holds 49 tracked files from `tauri android init` (commit `58dfd14`).
  `mobile/pending-android_scaffold-med-easy.md` is stale as to the scaffolding
  step; its *acceptance* — emulator launch, UI renders without crash — is what
  is really outstanding, and the device run has now answered both.
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

### The blocker: a workspace cannot be opened at all

Nothing else in this epic matters until this is answered. On device, no
workspace can be opened — with or without git.

The cause is structural rather than a bug. `workspaceAdapter.pickWorkspaceDirectory`
asks `tauri-plugin-dialog` for `open({ directory: true })`. Android has no such
picker: the Storage Access Framework hands back a `content://` URI, not a
filesystem path. And even given one, `resolve_workspace_root`
(`commands/workspace.rs:442`) requires a path that is absolute and
`canonicalize()`s to a directory — which a `content://` URI cannot be.

So the whole workspace model assumes a real filesystem path, and on Android the
app can only address paths it owns: its own app-specific external storage. The
open decisions are which of these to take, and they are product decisions, not
implementation ones:

- **App-owned vault directory.** The app creates and owns the vault under its
  own storage. No picker, nothing to grant, works today. The cost is that the
  vault is not somewhere the user can browse to with another app, and on many
  devices it is removed when the app is uninstalled.
- **SAF, properly.** Real user-chosen folders, at the price of teaching the
  entire native layer to speak `content://` instead of `Path` — every command
  in `workspace.rs`, `markdown.rs`, `backup.rs` and the sync layer. Large.
- **Clone-first onboarding.** Notably, *this problem does not exist for git.*
  Cloning creates the vault at a path the app chooses, so no picker is needed
  and no permission is asked for. On a phone, "sign in and clone your notes" is
  a better first run than "find a folder" regardless — which makes git the
  natural mobile entry point rather than an advanced feature.

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
  chrome, not the surfaces inside it. A full visual reference for the intended
  phone-first shell — universal top header, bottom nav hub, action sheets and
  drawers — lives at `plans/mobile/assets/mobile-ui-mockup.html`; it informs
  `pending-mobile_navigation_menu-med-med.md` and
  `pending-responsive_layout-med-med.md` and has not yet been formally
  approved through a discovery gate.
- **The activity bar is wrong for touch.** `ActivityBar.tsx` is a 53-line rail
  of icon-only buttons — the labels exist as `aria-label` only. On mobile it
  should be a popout menu **with visible labels**: an icon rail on a phone is
  both too small to hit and too cryptic without text. The `Popout` components
  (`panels/Popout.tsx`) already do full-screen overlay under 760px, so the
  surface to reuse exists.
- **The soft keyboard breaks the editor.** Tracked upstream at
  tauri-apps/tauri#10631: the webview viewport does not resize when the
  keyboard opens, which breaks CodeMirror cursor positioning and scrolling.
  This is not ours to fix and it gates mobile editing — a notes app that puts
  the cursor in the wrong place while typing is not shippable. It needs
  verifying on a current Tauri, then a workaround.

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
Phone-first on small screens (single panel, bottom tab navigation), multi-panel
on large screens (current desktop layout). There is no separate screen tree or
navigation stack — the same React components reflow based on viewport width.

### Capability gating

Some Tauri commands are desktop-only (terminal, process-spawn). The trusted
extension system uses platform-aware capability declarations as soft
compatibility signals (already in the `extensions` plan): mobile builds may
report features as unavailable and warn or disable their UI paths. These
declarations are not security enforcement, a sandbox, or a hostile-extension
boundary.

### Known limitations

- **Android keyboard / `visualViewport` issue** (critical for text editing,
  tracked at tauri-apps/tauri#10631): the webview viewport does not resize
  correctly when the soft keyboard opens, which breaks CodeMirror cursor
  positioning and scrolling. Must be verified and worked around before mobile
  editing ships.
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

No cloud sync. Mobile users rely on the same external sync tools
(OneDrive/Syncthing/Git) as desktop. App caches/settings never go in the vault.

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

- 🟥 **A workspace cannot be opened on Android at all** — the directory picker
  does not exist on the platform, and the native layer requires a filesystem
  path. See "Where it actually stands" above.
  `mobile/pending-android_workspace_access-high-hard.md`
- ⬜ Git clone as the mobile way in, and what a token can be kept in —
  `mobile/pending-mobile_git_access-high-hard.md`
- ⬜ Navigation menu replacing the icon rail, with visible labels —
  `mobile/pending-mobile_navigation_menu-med-med.md`
- 🟨 Responsive layout — the shell chrome adapts under 760px, the surfaces
  inside it do not — `mobile/pending-responsive_layout-med-med.md`
- ⬜ Touch-friendly navigation (swipe gestures, 44px touch targets)
- ✅ `tauri android init` — the scaffold is committed under
  `src-tauri/gen/android/`, and the app builds, installs and launches on a
  device. `mobile/pending-android_scaffold-med-easy.md` still holds the
  remaining acceptance for it.
- 🟨 Mobile Tauri config — `capabilities/mobile.json` exists and the
  desktop-only dependencies are gated; the soft "unavailable on mobile"
  reporting for desktop-only commands is not built —
  `mobile/pending-mobile_tauri_config-med-easy.md`
- ⬜ CodeMirror mobile testing and fixes — gated on the upstream soft-keyboard
  viewport bug (tauri-apps/tauri#10631) —
  `mobile/pending-codemirror_mobile_testing-med-med.md`
- ⬜ Reuse current Tauri adapters; raise only proven cross-cutting adapter gaps through maintenance
- ❓ Search index (`rusqlite`) and file watcher (`notify`) on a device —
  neither observed working nor failing

**Phase 2 — iOS (low urgency, deferred until Android is stable):**

- ⬜ `tauri ios init` — scaffold iOS target (requires macOS) — `mobile/pending-ios_scaffold-low-easy.md`
