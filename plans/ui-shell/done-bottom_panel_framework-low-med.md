# Bottom Panel Framework

## Goal

Add the mockup-v3 bottom-panel container and status-bar toggle without claiming
terminal, diagnostics, or backlinks features before their data providers exist.

The bottom-panel behavioral foundation is complete. Its production styling still
uses Tailwind utility classes, so CSS Modules backed by shared `--tn-*` tokens
remain a pending migration; see `plans/theme-foundation/pending-surface_styling_migration-med-med.md`.

## Acceptance Criteria

- [x] Status bar toggles a persistent bottom-panel visibility state with
      `Ctrl/Cmd+J`, accessible button state, and correct editor sizing.
- [x] Problems, output, terminal, and backlinks-preview tabs have typed
      provider boundaries plus honest empty/unavailable states.
- [x] Indexer and native-shell feedback uses real state; terminal execution is
      not exposed until the ACP/native capability work supplies it.
- [ ] Bottom panel production styling uses co-located CSS Modules backed by
      shared `--tn-*` tokens, with no Tailwind utility classes or inline styles;
      the styling migration remains pending (see
      `plans/theme-foundation/pending-surface_styling_migration-med-med.md`).
- [x] Bottom panel behavior respects reduced motion and small-window overflow.

## References

- `mockup_v3/src/components/{BottomPanel,StatusBar}.tsx`
- `apps/desktop/src/shell/DesktopShell.tsx`, `shell/StatusBar.tsx`, and `panels/BottomPanel.tsx` — current visibility/composition owners
- `plans/wip-ai-low-hard.md`
