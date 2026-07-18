# Bottom Panel Framework

## Goal

Add the mockup-v3 bottom-panel container and status-bar toggle without claiming
terminal, diagnostics, or backlinks features before their data providers exist.

## Acceptance Criteria

- [ ] Status bar toggles a persistent bottom-panel visibility state with
      `Ctrl/Cmd+J`, accessible button state, and correct editor sizing.
- [ ] Problems, output, terminal, and backlinks-preview tabs have typed
      provider boundaries plus honest empty/unavailable states.
- [ ] Indexer and native-shell feedback uses real state; terminal execution is
      not exposed until the ACP/native capability work supplies it.
- [ ] Bottom panel styling is a CSS Module with tokenized colors and respects
      reduced motion and small-window overflow.

## References

- `mockup_v3/src/components/{BottomPanel,StatusBar}.tsx`
- `apps/desktop/src/stores/appStore.ts`
- `plans/wip-ai-low-hard.md`
