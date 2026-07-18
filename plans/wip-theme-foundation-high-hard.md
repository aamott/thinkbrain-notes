# Theme Foundation

Built-in theme and UI-component foundation: CSS variable design tokens, light
and dark themes, reusable base components in `packages/ui`, and
accessibility-focused primitives. Provides the visual layer for all desktop
shell surfaces without a heavy opinionated UI framework.

## Scope

- CSS variable token system (color, spacing, typography, radius, shadow,
  z-index) consolidated in `packages/ui`.
- Default light theme and default dark theme as token sets.
- System theme resolution: map the `"system"` setting to the OS light/dark
  preference.
- Reusable base components in `packages/ui` (inputs, selects, checkboxes,
  fields, layout primitives).
- Accessibility-focused primitives using Radix UI-style patterns where useful
  (focus traps, keyboard navigation, ARIA wiring) — without adopting a heavy
  component framework.
- Theme selection state/setting — settings persistence is already implemented;
  this epic wires the setting to actual theme application.
- Basic styling for shell/editor/sidebar surfaces using tokens and CSS Modules.

## Architecture Decisions

- **Tokens are CSS variables.** All theme values are CSS custom properties
  scoped under `:root` and theme attribute selectors. No JS theme objects for
  MVP.
- **Tokens live in `packages/ui`.** Both light and dark token definitions
  belong in `packages/ui/src/styles/`, not split across `packages/ui` and
  `apps/desktop`. The desktop app imports the token stylesheet.
- **Theme is applied via `data-thinkbrain-theme` attribute** on
  `document.documentElement`. The `"system"` value must resolve to `light` or
  `dark` based on `prefers-color-scheme`, not be passed through as a literal
  attribute value with no matching CSS rule.
- **No inline styles.** Use CSS Modules (`*.module.css`) co-located with
  components. Shared tokens/themes as CSS variables in `packages/ui`.
- **Custom components over framework.** Build app components backed by Radix
  UI-style primitives where useful. Avoid a heavy, opinionated component
  framework that fights a desktop/editor UI.
- **No third-party theme loading in MVP.** Installable themes, remote theme
  loading, theme marketplace, and public extension APIs are deferred to the
  `extensions` epic.

## Dependencies

- Settings (done) — theme selection is persisted via `AppSettings.theme` in
  `packages/core/src/settings.ts` and applied in `apps/desktop/src/App.tsx`.

## Non-Goals

- Installable theme packages or theme marketplace.
- Remote/arbitrary theme loading.
- Public theme extension API.
- Heavy opinionated UI framework (Material UI, Ant Design, etc.).
- React Native `StyleSheet` theming (Phase 2 / `mobile` epic).

## Status

- ✅ Theme selection setting persisted — `packages/core/src/settings.ts`, `apps/desktop/src/settings/SettingsPanel.tsx`
- ⬜ CSS variable token system consolidated in `packages/ui` — currently split: `packages/ui/src/styles/tokens.css` (dark `:root`), `apps/desktop/src/styles.css` (light overrides)
- ⬜ Default light theme token set — `apps/desktop/src/styles.css:24-34` (partial, should move to `packages/ui`)
- ⬜ Default dark theme token set — `packages/ui/src/styles/tokens.css:1-15` (partial, no explicit `[data-thinkbrain-theme="dark"]` block)
- ⬜ System theme resolves to OS preference — `apps/desktop/src/App.tsx:58-60` sets `data-thinkbrain-theme="system"` but no CSS rule matches `"system"`
- ⬜ Reusable base components in `packages/ui` — only `Button` exists (`packages/ui/src/components/Button.tsx`)
- ⬜ Accessibility-focused primitives (Radix UI-style) — none yet
- ⬜ Shell/editor/sidebar surfaces use tokens + CSS Modules — `apps/desktop/src/styles.css` is a single global stylesheet with hardcoded colors (e.g. `#0c0f16` at lines 88, 608)
