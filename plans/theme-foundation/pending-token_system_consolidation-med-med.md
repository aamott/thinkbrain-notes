# Token System Consolidation

## Goal

Consolidate all CSS variable design tokens into `packages/ui` so both light and
dark theme definitions live in one place. Expand the token set beyond colors to
include spacing, typography, radius, shadow, and z-index scales.

## Acceptance Criteria

- [x] All theme tokens (light and dark) are defined in
      `packages/ui/src/styles/`; `apps/desktop/src/index.css` contains no theme
      token definitions.
- [ ] Token categories cover: color, spacing, typography, radius, shadow,
      z-index.
- [ ] `apps/desktop` imports the consolidated token stylesheet from
      `@thinkbrain/ui`.
- [ ] Existing token names (`--tn-color-*`, `--tn-radius-medium`,
      `--tn-shadow-soft`, `--tn-font-sans`) are preserved or migrated with a
      clear mapping.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `packages/ui/src/styles/tokens.css` — consolidated light/dark tokens
- `packages/ui/package.json:13` — `./styles.css` export for the token sheet
- `apps/desktop/src/main.tsx` — imports `@thinkbrain/ui/styles.css` token sheet.
- `apps/desktop/src/index.css` — current global app stylesheet to reduce to
  reset/base rules during the token consolidation.
