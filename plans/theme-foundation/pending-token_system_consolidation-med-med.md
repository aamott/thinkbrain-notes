# Token System Consolidation

## Goal

Consolidate all CSS variable design tokens into `packages/ui` so both light and
dark theme definitions live in one place. Expand the token set beyond colors to
include spacing, typography, radius, shadow, and z-index scales.

## Acceptance Criteria

- [ ] All theme tokens (light and dark) are defined in
      `packages/ui/src/styles/` — no theme token definitions remain in
      `apps/desktop/src/styles.css`.
- [ ] Token categories cover: color, spacing, typography, radius, shadow,
      z-index.
- [ ] `apps/desktop` imports the consolidated token stylesheet from
      `@thinkbrain/ui`.
- [ ] Existing token names (`--tn-color-*`, `--tn-radius-medium`,
      `--tn-shadow-soft`, `--tn-font-sans`) are preserved or migrated with a
      clear mapping.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `packages/ui/src/styles/tokens.css` — current dark `:root` tokens
- `apps/desktop/src/styles.css:24-34` — light theme overrides to move
- `packages/ui/package.json:13` — `./styles.css` export
- `apps/desktop/src/App.tsx:3` — imports `@thinkbrain/ui/styles.css`
