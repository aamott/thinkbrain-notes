# Default Light Theme

## Goal

Define a complete light theme token set under
`:root[data-thinkbrain-theme="light"]` in `packages/ui`. Ensure all surfaces
(shell, sidebar, editor, activity bar, status bar) have sensible light-mode
values.

## Acceptance Criteria

- [ ] `:root[data-thinkbrain-theme="light"]` defines every token used by the
      app — no token falls through to the dark `:root` default when light is
      active.
- [ ] Light theme has `color-scheme: light`.
- [ ] Hardcoded colors in shell surfaces (e.g. `#0c0f16` on activity bar and
      status bar) are replaced with tokens that have light-mode values.
- [ ] Light theme is visually verified across all shell regions.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `apps/desktop/src/styles.css:24-34` — current partial light overrides
- `apps/desktop/src/styles.css:88` — hardcoded activity bar color
- `apps/desktop/src/styles.css:608` — hardcoded status bar color
- `packages/ui/src/styles/tokens.css` — target location for consolidated tokens
