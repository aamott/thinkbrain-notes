# Surface Styling Migration

## Goal

Migrate the desktop shell's single global `styles.css` to co-located CSS
Modules per component/surface. Replace all hardcoded colors with design tokens.
Ensure shell, editor, and sidebar surfaces consume tokens from `packages/ui`.

## Acceptance Criteria

- [ ] `apps/desktop/src/styles.css` is removed or reduced to truly global
      resets only — component styles move to `*.module.css` files co-located
      with their components.
- [ ] No hardcoded color values remain in surface styles (e.g. `#0c0f16`,
      `#ff8d8d`) — all use CSS variable tokens.
- [ ] Shell regions (title bar, activity bar, sidebar, editor area, right
      panel, status bar) use tokens for background, foreground, border, and
      accent.
- [ ] CodeMirror editor surface uses tokens for background, foreground, gutters,
      active line, and caret.
- [ ] No inline styles (`style={{}}` or `<style>` in JSX).
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `apps/desktop/src/styles.css` — 621-line global stylesheet to decompose
- `apps/desktop/src/styles.css:88` — hardcoded `#0c0f16` (activity bar)
- `apps/desktop/src/styles.css:608` — hardcoded `#0c0f16` (status bar)
- `apps/desktop/src/styles.css:292` — hardcoded `#ff8d8d` (error border)
- `apps/desktop/src/styles.css:438` — hardcoded `#ff8d8d` (editor error border)
- `apps/desktop/src/App.tsx` — shell layout component
- `apps/desktop/src/editor/MarkdownEditor.tsx` — editor surface
- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — sidebar surface
