# Surface Styling Migration

## Goal

Align the desktop shell's current surface styling per component/surface.
Replace hardcoded colors with shared `--tn-*` design tokens. Ensure shell,
editor, and sidebar surfaces consume the tokens from `packages/ui`.

## Acceptance Criteria

- [x] `apps/desktop/src/index.css` is reduced to truly global resets and
      narrowly scoped third-party editor styling.
- [x] No hardcoded color values remain in surface styles (e.g. `#0c0f16`,
      `#ff8d8d`) — all use shared `--tn-*` token variables.
- [x] Shell regions (title bar, activity bar, sidebar, editor area, right
      panel, status bar) use shared tokens for background, foreground, border,
      and accent.
- [x] CodeMirror editor surface uses token-backed colors for background,
      foreground, gutters, active line, and caret.
- [x] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `apps/desktop/src/index.css` — current global entry to reduce to resets and
  narrowly scoped third-party editor overrides
- `packages/ui/src/styles/tokens.css` — token source of truth
- `apps/desktop/src/shell/` — shell surfaces
- `apps/desktop/src/tabs/` — editor and preview surfaces
- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — explorer surface owner
