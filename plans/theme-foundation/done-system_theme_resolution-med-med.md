# System Theme Resolution

**Status:** ✅ done

## Goal

Make the `"system"` theme setting resolve to `light` or `dark` based on the OS
`prefers-color-scheme` media query. `ThemeProvider.tsx` owns the theme
attribute, and the token stylesheet must provide the matching system behavior
while the setting remains `"system"`.

## Acceptance Criteria

- [x] When `settings.theme === "system"`, the app applies `light` or `dark`
      based on `window.matchMedia("(prefers-color-scheme: dark)")`.
- [x] The app reacts to OS theme changes while running (listener on
      `matchMedia` `change` event).
- [x] The `data-thinkbrain-theme` attribute is always `light` or `dark` on the
      document element — never `system`.
- [x] The settings panel still shows "System" as the selected option when the
      underlying setting is `"system"`.
- [x] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## File References

- `apps/desktop/src/settings/ThemeProvider.tsx` — theme application and OS
  preference resolution
- `packages/core/src/settings/modules/appearance.ts` — appearance theme
  setting includes `"system"`
- `apps/desktop/src/settings/ThemeSectionControls.tsx` — theme selection UI
