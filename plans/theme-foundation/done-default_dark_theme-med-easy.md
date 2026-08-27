# Default Dark Theme

## Goal

Define an explicit `:root[data-thinkbrain-theme="dark"]` token block in
`packages/ui` rather than relying on `:root` as the implicit dark default.
Ensure dark theme values are complete and intentional, not just fallback.

## Acceptance Criteria

- [x] `:root[data-thinkbrain-theme="dark"]` explicitly defines every token.
- [x] Dark theme has `color-scheme: dark`.
- [x] `:root` retains a sensible default (dark) for the brief moment before the
      theme attribute is applied, but the authoritative dark values live in the
      `[data-thinkbrain-theme="dark"]` selector.
- [x] Hardcoded colors in shell surfaces are replaced with tokens that have
      dark-mode values.
- [x] Dark theme is visually verified across all shell regions.
- [x] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `packages/ui/src/styles/tokens.css` — `:root` and
  `[data-thinkbrain-theme="dark"]` token definitions
- `apps/desktop/src/main.tsx` — imports the shared token stylesheet.
- `apps/desktop/src/index.css` — global app reset/base stylesheet.
