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

- `packages/ui/src/styles/tokens.css` — consolidated light token definitions
- `apps/desktop/src/main.tsx` — imports the shared token stylesheet.
- `apps/desktop/src/index.css` — global app reset/base stylesheet.
