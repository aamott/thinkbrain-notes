# Resizable Panel Persistence

## Goal

Give left and right popouts durable, accessible widths without using JSX inline
styles or persisting preferences in the workspace.

## Acceptance Criteria

- [ ] Layout state stores left/right widths, visibility, defaults, and clamped
      min/max values; hydration and debounced save go through Tauri settings to
      OS app-data.
- [ ] `ResizeHandle` handles pointer capture or equivalent window cleanup,
      cancel, double-click reset, and keyboard resize semantics.
- [ ] The shell root writes only `--tn-shell-left-width` and
      `--tn-shell-right-width` through a scoped ref/CSSOM; CSS Modules own
      default and hidden values.
- [ ] Invalid or stale saved preferences fall back safely and unit tests cover
      clamping, reset, hydration, and cleanup.
- [ ] Resizing does not select text, trap focus, or interfere with editor input.

## References

- `mockup_v3/src/components/ResizeHandle.tsx`
- `mockup_v3/src/App.tsx`
- `apps/desktop/src/settings/settingsService.ts`
