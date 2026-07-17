# Shell Theme Control

## Goal

Expose the mockup-v3 theme toggle through the existing application settings and
the expanded shared token system.

## Acceptance Criteria

- [ ] Title-bar theme control reads and writes the existing settings flow; it
      never uses `localStorage` as a second source of truth.
- [ ] The root `data-thinkbrain-theme` attribute updates immediately and all
      shell/panel/tab tokens have light and dark values.
- [ ] Theme control has a clear label, pressed/state feedback, and a command
      palette command.
- [ ] Tests cover persisted setting hydration and document attribute update.

## References

- `mockup_v3/src/components/{TitleBar,theme-provider}.tsx`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/settings/settingsService.ts`
