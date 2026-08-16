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
- Basic styling for shell/editor/sidebar surfaces using shared `--tn-*` tokens
  and co-located CSS Modules.

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
- **No inline styles.** Use co-located CSS Modules for desktop surfaces,
  backed by the shared `--tn-*` variables in `packages/ui`; keep shared
  tokens/themes as CSS variables. Tailwind utility classes must not be copied
  into production JSX.
- **Custom components over framework.** Build app components backed by Radix
  UI-style primitives where useful. Avoid a heavy, opinionated component
  framework that fights a desktop/editor UI.
- **Importable themes.** Users can import theme files (CSS variable overrides)
  from disk. Themes are JSON or CSS files that override `--tn-*` tokens. A
  theme file provides a display name, a base (light/dark), and token
  overrides. The app loads and applies them without requiring the extensions
  epic. A remote theme marketplace is deferred to `extensions`.

## Dependencies

- Settings (done) — theme selection and custom theme paths are persisted via
  the appearance settings module in `packages/core/src/settings/modules/appearance.ts`
  and applied by `apps/desktop/src/settings/ThemeProvider.tsx`.

## Non-Goals

- Theme marketplace or remote theme registry.
- Public theme extension API (deferred to `extensions` epic).
- Heavy opinionated UI framework (Material UI, Ant Design, etc.).
- Mobile-specific theming work (Phase 2 / `mobile` epic) — mobile reuses the
  same CSS tokens as desktop via Tauri Mobile's shared webview.

## Status

- ✅ Theme selection setting persisted — `packages/core/src/settings/modules/appearance.ts`, `apps/desktop/src/settings/ThemeSectionControls.tsx`
- ✅ CSS variable token system consolidated in `packages/ui` — defined in
  `packages/ui/src/styles/tokens.css` and imported by `apps/desktop/src/main.tsx`.
- ✅ Default light theme token set — implemented in `:root, :root[data-thinkbrain-theme="light"]`.
- ✅ Default dark theme token set — implemented in `:root[data-thinkbrain-theme="dark"]`.
- 🟨 System theme has CSS fallback coverage, but `ThemeProvider.tsx` still writes literal `system`; full light/dark resolution and OS-change handling remain in `pending-system_theme_resolution-med-med.md`.
- ✅ Reusable base components in `packages/ui` — `shadcn/ui` initialized and `Button` component added.
- ✅ Accessibility-focused primitives (Radix UI-style) — implemented via `shadcn/ui` (Radix UI under the hood).
- ⬜ Shell/editor/sidebar surfaces use shared `--tn-*` tokens + co-located CSS
  Modules — the current production source still uses Tailwind utility classes,
  so CSS-module migration remains pending.
- Importable themes are substantially implemented — parser/serialization in
  `packages/core/src/theme.ts`, application in
  `apps/desktop/src/settings/ThemeProvider.tsx`, and import/export in
  `apps/desktop/src/settings/themeImportExport.ts`; strict CSS color-value
  validation remains before closing `pending-importable_themes-med-hard.md`.
