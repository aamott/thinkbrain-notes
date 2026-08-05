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
- **Importable themes.** Users can import theme files (CSS variable overrides)
  from disk. Themes are JSON or CSS files that override `--tn-*` tokens. A
  theme file provides a display name, a base (light/dark), and token
  overrides. The app loads and applies them without requiring the extensions
  epic. A remote theme marketplace is deferred to `extensions`.

## Dependencies

- Settings (done) — theme selection is persisted via `AppSettings.theme` in
  `packages/core/src/settings.ts` and applied in `apps/desktop/src/App.tsx`.

## Non-Goals

- Theme marketplace or remote theme registry.
- Public theme extension API (deferred to `extensions` epic).
- Heavy opinionated UI framework (Material UI, Ant Design, etc.).
- React Native `StyleSheet` theming (Phase 2 / `mobile` epic).

## Status

- ✅ Theme selection setting persisted — `packages/core/src/settings.ts`, `apps/desktop/src/settings/SettingsPanel.tsx`
- ✅ CSS variable token system consolidated in `packages/ui` — defined in `packages/ui/src/styles/tokens.css` and mapped to Tailwind v4 in `apps/desktop/src/index.css`.
- ✅ Default light theme token set — implemented in `:root, :root[data-thinkbrain-theme="light"]`.
- ✅ Default dark theme token set — implemented in `:root[data-thinkbrain-theme="dark"]`.
- ✅ System theme resolves to OS preference — implemented via `@media (prefers-color-scheme: dark)` mapping `[data-thinkbrain-theme="system"]` to dark colors.
- ✅ Reusable base components in `packages/ui` — `shadcn/ui` initialized and `Button` component added.
- ✅ Accessibility-focused primitives (Radix UI-style) — implemented via `shadcn/ui` (Radix UI under the hood).
- ✅ Shell/editor/sidebar surfaces use tokens + CSS Modules — Legacy CSS Modules deleted, fully migrated to Tailwind v4 utility classes.
- ⬜ Importable themes — load user-supplied theme files (JSON/CSS token overrides) from disk and apply them via `data-thinkbrain-theme`
