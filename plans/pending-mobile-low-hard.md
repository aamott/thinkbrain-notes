# Mobile

> Tauri Mobile — a future epic, not yet started. Mobile is a responsive variant
> of the desktop app, not a separate app. Read `plans/app-vision.md` and
> `plans/technical-decisions.md` (Platform section) before starting any story
> here.

## Goal

Ship Android and iOS builds of the existing desktop app via Tauri v2's mobile
support. Tauri Mobile uses the same webview stack as desktop, so the entire
React frontend, `packages/ui`, CodeMirror 6, and the adapter pattern are reused
as-is. Mobile is a responsive layout of the same codebase — phone-first on
small screens, multi-panel on large screens — not a separate app, separate UI
layer, or separate adapter set.

## Scope

In scope:

- `tauri android init` / `tauri ios init` scaffolding for the Android and iOS
  targets
- Responsive layout breakpoints (Tailwind) so the desktop shell adapts to phone
  screens
- Touch-friendly navigation (bottom tabs, swipe gestures, 44px touch targets)
- Mobile capability gating — desktop-only Tauri commands (terminal,
  process-spawn) are excluded from mobile builds via platform-aware capabilities
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

Mobile uses CSS breakpoints (Tailwind) to switch between desktop and mobile
layouts within the same shell. Phone-first on small screens (single panel,
bottom tab navigation), multi-panel on large screens (current desktop layout).
There is no separate screen tree or navigation stack — the same React
components reflow based on viewport width.

### Capability gating

Some Tauri commands are desktop-only (terminal, process-spawn). The trusted
extension system uses platform-aware capability declarations as compatibility
gates (already in the `extensions` plan): mobile builds may declare a more
restrictive set and warn/disable desktop-only features. These gates are not a
security sandbox or hostile-extension boundary.

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

### Prerequisite: core adapter interfaces still apply

The core adapter interfaces in `packages/core` (from the maintenance epic) are
still a prerequisite, but the rationale has changed: it is now about clean
separation and testability, not about mobile-specific adapter implementations.
Mobile reuses the same Tauri adapters as desktop — there are no separate Expo
adapters to write.

### Bring Your Own Sync

No cloud sync. Mobile users rely on the same external sync tools
(OneDrive/Syncthing/Git) as desktop. App caches/settings never go in the vault.

## Dependencies

- Core adapter interfaces defined in `packages/core` (see prerequisite note
  above — tracked in `plans/maintenance/`).
- `packages/core` business logic (note model, frontmatter, markdown parsing,
  settings shapes) — already present and platform-agnostic.
- `packages/ui` and the React frontend — already shared, no mobile-specific
  work needed beyond responsive layout.

No other epic blocks this one, but it should not start until the adapter
interface prerequisite is resolved.

## Status

- ⬜ Responsive layout breakpoints (Tailwind, phone-first on small screens)
- ⬜ Touch-friendly navigation (bottom tabs, swipe gestures, 44px touch targets)
- ⬜ `tauri android init` — scaffold Android target
- ⬜ `tauri ios init` — scaffold iOS target (requires macOS)
- ⬜ Mobile Tauri config (permissions, capabilities, no desktop-only commands)
- ⬜ CodeMirror mobile testing and fixes (scrolling, IME, touch selection)
- ⬜ Core adapter interfaces in `packages/core` (prerequisite — tracked in maintenance)
