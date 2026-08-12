# Mobile

> Tauri Mobile epic. **Android is the priority target; iOS follows later.**
> Mobile is a responsive variant of the desktop app, not a separate app. Read
> `plans/app-vision.md` and `plans/technical-decisions.md` (Platform section)
> before starting any story here. Urgency is medium — elevated from low, but
> balanced against in-progress core epics.

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
- Responsive layout breakpoints using co-located CSS Modules and shared `--tn-*`
  tokens so the desktop shell adapts to phone screens
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

## Architecture Decisions

### Same codebase as desktop

Tauri v2 Mobile uses the same webview as desktop, so the entire React frontend,
`packages/ui`, CodeMirror 6, and the adapter pattern are reused without
duplication. Mobile is a build target of `apps/desktop/`, not a separate app.
No `apps/mobile/` directory is created. The hub-and-spoke contract from
`app-vision.md` and `technical-decisions.md` is unchanged — `packages/core`
stays platform-agnostic, and `apps/desktop` provides the Tauri adapters that
both desktop and mobile builds use.

### Responsive layout

Mobile uses CSS media queries and co-located CSS Modules with shared `--tn-*`
tokens to switch between desktop and mobile layouts within the same shell.
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

- ⬜ Responsive layout breakpoints (CSS Modules + shared `--tn-*` tokens,
  phone-first on small screens) — `mobile/pending-responsive_layout-med-med.md`
- ⬜ Touch-friendly navigation (bottom tabs, swipe gestures, 44px touch targets)
- ⬜ `tauri android init` — scaffold Android target — `mobile/pending-android_scaffold-med-easy.md`
- ⬜ Mobile Tauri config (soft capability declarations and unavailable
  desktop-only commands) — `mobile/pending-mobile_tauri_config-med-easy.md`
- ⬜ CodeMirror mobile testing and fixes (scrolling, IME, touch selection) —
  `mobile/pending-codemirror_mobile_testing-med-med.md`
- ⬜ Reuse current Tauri adapters; raise only proven cross-cutting adapter gaps through maintenance

**Phase 2 — iOS (low urgency, deferred until Android is stable):**

- ⬜ `tauri ios init` — scaffold iOS target (requires macOS) — `mobile/pending-ios_scaffold-low-easy.md`
