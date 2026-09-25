# Theme Foundation Epic — Completed Work

Token system and theming shipped to the degree the desktop shell needed; the
consolidation follow-ups (expanded token scales, broader base components,
remaining surface migration) are still pending stories in this folder.

## Shipped

- `default_light_theme` / `default_dark_theme` — both token sets defined in
  `packages/ui/src/styles/tokens.css` under `:root` /
  `data-thinkbrain-theme` selectors.
- `system_theme_resolution` — `"system"` resolves via
  `matchMedia("(prefers-color-scheme: dark)")` and tracks OS changes live;
  the attribute is always a concrete base theme.
- `surface_styling_migration` — shell/editor/sidebar surfaces consume shared
  `--tn-*` tokens; no hardcoded colors remain in surface styles.
- `accessibility_primitives` — shadcn/Radix-style primitives (focus,
  keyboard, ARIA) underpin the component set.
- `importable_themes` — JSON/CSS theme files override `--tn-*` tokens;
  strict parser/validation in `packages/core/src/theme.ts`, application in
  `ThemeProvider.tsx`, import/export in `settings/themeImportExport.ts`.
- `theme selection setting` — persisted via the appearance settings module,
  applied by `ThemeProvider.tsx`.

## Still open

`token_system_consolidation` (spacing/typography/radius/shadow/z-index scales)
and `reusable_base_components` (input, select, checkbox, field, surface —
only `Button` shipped).
