# Theme Foundation

Built-in theme and UI-component foundation: CSS variable design tokens, light
and dark themes, reusable base components in `packages/ui`, and
accessibility-focused primitives. Provides the visual layer for all desktop
shell surfaces without a heavy opinionated UI framework.

## Scope

- CSS variable token system (color, spacing, typography, radius, shadow,
  z-index) consolidated in `packages/ui`.
- Default light and dark themes as token sets; `"system"` resolves to the OS
  preference.
- Reusable base components in `packages/ui` (inputs, selects, checkboxes,
  fields, layout primitives) on Radix-style primitives — no heavy framework.
- Theme selection state wired to actual theme application.
- Shell/editor/sidebar surfaces styled with shared `--tn-*` tokens.
- Importable themes: JSON/CSS files overriding `--tn-*` tokens, loaded
  without the extensions epic.

## Architecture Decisions

- Tokens are CSS variables under `:root` / theme attribute selectors; no JS
  theme objects.
- Tokens live in `packages/ui/src/styles/`; the desktop app imports the
  token stylesheet.
- Theme applied via `data-thinkbrain-theme` on `documentElement`; `"system"`
  resolves to `light`/`dark` via `prefers-color-scheme`.
- Custom components over a heavy opinionated framework.
- Theme files provide a display name, a base (light/dark), and token
  overrides; a remote theme marketplace is deferred to `extensions`.

## Dependencies

- Settings (done) — theme selection and custom theme paths persist via
  `packages/core/src/settings/modules/appearance.ts` and apply via
  `apps/desktop/src/settings/ThemeProvider.tsx`.

## Non-Goals

- Theme marketplace/remote registry and public theme extension API
  (deferred to `extensions`).
- Heavy UI framework (Material UI, Ant Design).
- Mobile-specific theming — mobile reuses the same tokens via the shared
  webview.

## Status

Shipped stories are summarized in `plans/theme-foundation/done-summary.md`.

- ✅ Theme selection setting, light + dark token sets, system theme
  resolution, accessibility primitives (shadcn/Radix), importable themes.
- 🟨 `token_system_consolidation` — color tokens live in
  `packages/ui/src/styles/tokens.css`; spacing/typography/radius/shadow/
  z-index scales and remaining surface migration remain.
- 🟨 `reusable_base_components` — `Button` shipped; input, select, checkbox,
  field wrapper, and surface primitives remain.
