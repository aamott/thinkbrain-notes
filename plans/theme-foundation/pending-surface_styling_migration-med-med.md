# Surface Styling Migration

## Goal

Migrate the desktop shell's current surface styling to co-located CSS Modules per
component/surface. Replace hardcoded colors with shared `--tn-*` design tokens.
Ensure shell, editor, and sidebar surfaces consume the tokens from
`packages/ui`.

The current production TSX still contains Tailwind utility classes and no
co-located CSS Modules for these surfaces, so this migration remains pending.

## Acceptance Criteria

- [ ] `apps/desktop/src/index.css` is reduced to truly global resets and
      narrowly scoped third-party editor styling; component styles move to
      co-located `*.module.css` files.
- [ ] No hardcoded color values remain in surface styles (e.g. `#0c0f16`,
      `#ff8d8d`) — all use shared `--tn-*` token variables.
- [ ] Shell regions (title bar, activity bar, sidebar, editor area, right
      panel, status bar) use co-located CSS Modules for background, foreground,
      border, and accent, backed by the shared tokens.
- [ ] CodeMirror editor surface uses a co-located CSS Module with token-backed
      colors for background, foreground, gutters, active line, and caret.
- [ ] No inline styles (`style={{}}` or `<style>` in JSX).
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `apps/desktop/src/index.css` — current global entry to reduce to resets and
  narrowly scoped third-party editor overrides
- `packages/ui/src/styles/tokens.css` — token source of truth
- `apps/desktop/src/shell/` — shell surfaces and their target co-located modules
- `apps/desktop/src/tabs/` — editor and preview surfaces and their target modules
- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — explorer surface owner
