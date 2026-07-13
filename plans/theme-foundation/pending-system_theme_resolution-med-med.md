# System Theme Resolution

## Goal

Make the `"system"` theme setting resolve to `light` or `dark` based on the OS
`prefers-color-scheme` media query. Currently `App.tsx` sets
`data-thinkbrain-theme="system"` but no CSS rule matches that value, so the
system option produces no theme.

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

- `apps/desktop/src/App.tsx:58-60` — current theme application effect
- `packages/core/src/settings.ts:12` — `AppThemeSetting` type includes `"system"`
- `apps/desktop/src/settings/SettingsPanel.tsx:49-61` — theme select dropdown
