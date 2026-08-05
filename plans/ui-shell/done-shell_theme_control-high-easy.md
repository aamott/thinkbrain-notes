# Shell Theme Control

## Goal

Expose the mockup-v3 theme toggle through the existing application settings and
the expanded shared token system.

## Acceptance Criteria

- [x] Title-bar theme control reads and writes the existing settings flow; it
      never uses `localStorage` as a second source of truth.
- [x] The root `data-thinkbrain-theme` attribute updates immediately and all
      shell/panel/tab tokens have light and dark values.
- [x] Theme control has a clear label, pressed/state feedback, and a command
      palette command.
- [x] Tests cover persisted setting hydration and document attribute update.

## Implementation

- **Rust**: New `update_app_theme` command in `src-tauri/src/commands/settings.rs`
  performs an atomic read-modify-write of the `theme` field under the existing
  `APP_SETTINGS_MUTATION_LOCK`. Validates the theme value against
  `SUPPORTED_APP_THEMES` and returns a typed `NativeError` for invalid input.
  Refactored shared `serialize_app_settings_record` helper.
- **Native bridge**: `update_app_theme` added to `NativeCommandMap` in
  `apps/desktop/src/native/commands.ts`.
- **Theme service**: New `apps/desktop/src/settings/themeService.ts` provides
  `loadTheme()` / `saveTheme()` via the native bridge, following the
  `desktopState.ts` adapter pattern.
- **ThemeProvider**: Rewritten to load the persisted theme from
  `themeService.loadTheme()` on mount (Tauri only) and persist via
  `themeService.saveTheme()`. `localStorage` usage removed entirely.
  `storageKey` prop removed; `defaultTheme` prop retained.
- **Shell wiring**: `DesktopShell.tsx` now uses `useTheme()` from
  `ThemeProvider` instead of local `useState<"light" | "dark">`. The duplicate
  `data-thinkbrain-theme` effect was removed (ThemeProvider owns it).
  `TitleBar.tsx` theme prop typed as `AppTheme` (includes "system").
- **Command palette**: Existing `toggle-theme` command cycles light/dark via
  `useTheme().setTheme()`.
- **Tests**: `ThemeProvider.test.tsx` covers default theme, child rendering,
  and `data-thinkbrain-theme` attribute application. Rust test
  `app_theme_update_replaces_theme_and_preserves_other_settings` covers
  theme update, field preservation, and invalid value rejection.
  `DesktopShell.test.tsx` wraps renders in `ThemeProvider`.

## References

- `mockup_v3/src/components/{TitleBar,theme-provider}.tsx`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/settings/themeService.ts`
- `apps/desktop/src/settings/ThemeProvider.tsx`
- `apps/desktop/src-tauri/src/commands/settings.rs`
