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

## Where it stands

Android v1 works end to end on device (verified 2026-08-27): scaffold, managed
vaults, clone-first Git onboarding, phone chrome, editor input. What shipped is
summarized in `plans/mobile/done-summary.md`; what remains is in Status below.

The decisions that survive the early spike narrative:

- **Managed vaults + clone-first** (approved 2026-08-25): native code creates or
  clones vaults under app data; Android never invokes the desktop folder picker
  (SAF returns `content://` URIs the native layers can't use). Direct SAF
  linked folders stay deferred to `mobile/android_saf_linked_folders` — research
  first, never `content://` → guessed `/storage/...` paths.
- **Credentials:** keyring v4 + `android-native-keyring-store` (decided
  2026-08-27). The desktop v3→v4 migration is `auto-sync/keyring_v4_migration`;
  this also settles the extension-secrets question `plans/extensions/` records.
- **Sync triggers:** Android freezes the process on background, so idle timers
  fire against a stale clock on resume. The shared wall-clock schedule replaced
  `sync.trigger` (`docs/superpowers/specs/2026-08-28-sync-schedule-design.md`).
- **Phone chrome design:** binding spec is
  `docs/superpowers/specs/2026-08-25-mobile-shell-design.md`;
  `plans/mobile/assets/phone-shell-mockup.html` is a look-and-feel reference
  only — a mockup's token namespace cannot be copied into `--tn-*` utilities.
- **CI caveat:** the gix cross-compile gate is `cargo check -p gix` — no link
  step, no Tauri build. The TLS-verifier panic that broke the first device
  clone is exactly what that gate cannot catch; test on a device for anything
  native-adjacent.

### Not yet verified on a device

The search index (`rusqlite`, bundled SQLite) and the file watcher (`notify`)
have never been observed working or failing on Android; `notify` sits under
Android's inotify restrictions.

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
  CodeMirror mobile testing and editing was verified on
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

Shipped stories are summarized in `plans/mobile/done-summary.md`; their story
files were reviewed and deleted per the plan-review policy in `AGENTS.md`.

**Phase 1 — Android (medium urgency):**

Ordered by what blocks what. The first item gates every other one: there is no
point tuning a layout for a workspace that cannot be opened.

- ✅ **Managed workspace access** — Android v1 creates or clones real-path
  vaults beneath app data. Native managed-vault commands, capability-gated
  UI, clone-first onboarding, and one-time uninstall notice all shipped.

- ✅ Git clone as the mobile way in — public and private managed imports run the
  shared desktop worker on Android. TLS initialisation, keyring v4, the
  Android-native credential store, non-destructive one-way imports, and mobile
  sync triggers are shipped. A private clone and required fetch/merge/push were
  verified end to end on Android on 2026-09-20, including editor autosave,
  process-restart credential read-back, and credential deletion. Token custody
  and the exact run are recorded in
  `docs/superpowers/specs/2026-08-27-android-git-access-design.md`.
- ✅ Phone shell chrome — headless shell state, form-factor gate, header,
  drawer, shortcut hub, tab-switcher and inspector sheets; verified on an
  Android device 2026-08-27.
- ✅ Files-first navigation — Files is the mobile home; browser-backed Back and
  Forward history, right-edge navigation, Action items and New note menus,
  bounded inspectors, and shared right-panel close controls shipped and were
  verified on Android.
- ✅ Phone surface fixes — popout width, bottom-edge contention, keyboard
  inset, `pointer-coarse:` sizing; verified on an Android device 2026-08-27
  including keyboard-inset behavior.
- ✅ `tauri android init` — the scaffold is committed under
  `src-tauri/gen/android/`, and the app builds, installs, launches and renders
  on a device.
- ✅ Mobile Tauri config — `capabilities/mobile.json`, gated desktop-only
  dependencies, and soft "unavailable on mobile" capability reporting for
  desktop-only commands.
- ✅ CodeMirror mobile testing — editing verified on Android emulator,
  `windowSoftInputMode="adjustResize"` added, tap-below-last-line fixed.
- ⬜ Reuse current Tauri adapters; raise only proven cross-cutting adapter gaps through maintenance
- ❓ Search index (`rusqlite`) and file watcher (`notify`) on a device —
  neither observed working nor failing
- ⏸️ SAF linked folders — deferred research-first follow-up after managed
  vaults are stable — `mobile/android_saf_linked_folders`

**Phase 2 — iOS (low urgency, deferred until Android is stable):**

- ⬜ `tauri ios init` — scaffold iOS target (requires macOS) — `mobile/ios_scaffold`
