# Default Dark Theme

## Goal

Define an explicit `:root[data-thinkbrain-theme="dark"]` token block in
`packages/ui` rather than relying on `:root` as the implicit dark default.
Ensure dark theme values are complete and intentional, not just fallback.

## Acceptance Criteria

- [ ] `:root[data-thinkbrain-theme="dark"]` explicitly defines every token.
- [ ] Dark theme has `color-scheme: dark`.
- [ ] `:root` retains a sensible default (dark) for the brief moment before the
      theme attribute is applied, but the authoritative dark values live in the
      `[data-thinkbrain-theme="dark"]` selector.
- [ ] Hardcoded colors in shell surfaces are replaced with tokens that have
      dark-mode values.
- [ ] Dark theme is visually verified across all shell regions.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `packages/ui/src/styles/tokens.css:1-15` — current `:root` (implicit dark)
- `packages/ui/src/styles/tokens.css:36-38` — empty `[data-thinkbrain-theme="dark"]` block
- `apps/desktop/src/styles.css:88` — hardcoded activity bar color
- `apps/desktop/src/styles.css:608` — hardcoded status bar color
