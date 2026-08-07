# System Theme Resolution

## Goal

Make the `"system"` theme setting resolve to `light` or `dark` based on the OS
`prefers-color-scheme` media query. `ThemeProvider.tsx` owns the theme
attribute, and the token stylesheet must provide the matching system behavior
while the setting remains `"system"`.

## Acceptance Criteria

- [ ] When `settings.theme === "system"`, the app applies `light` or `dark`
      based on `window.matchMedia("(prefers-color-scheme: dark)")`.
- [ ] The app reacts to OS theme changes while running (listener on
      `matchMedia` `change` event).
- [ ] The `data-thinkbrain-theme` attribute is always `light` or `dark` on the
      document element — never `system`.
- [ ] The settings panel still shows "System" as the selected option when the
      underlying setting is `"system"`.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `apps/desktop/src/settings/ThemeProvider.tsx` — theme application and OS
  preference resolution
- `packages/core/src/settings/modules/appearance.ts` — appearance theme
  setting includes `"system"`
- `apps/desktop/src/settings/ThemeSectionControls.tsx` — theme selection UI
