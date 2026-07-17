# Desktop Shell Composition

## Goal

Replace the current basic desktop grid with the mockup-v3 shell composition:
title bar, activity bar, optional popouts, editor region, bottom region, and
status bar—using real application state and components.

## Acceptance Criteria

- [x] `App.tsx` becomes a small boot/theme orchestrator; shell components live
      under `apps/desktop/src/shell/` and panels under `panels/`.
- [x] Title and activity bars use icon buttons with labels/tooltips and support
      explorer, search, source control, tags, extensions, assistant, settings,
      and theme actions with clear unavailable states where an epic owns work.
- [x] Shell layout keeps the editor usable with either/both popouts closed and
      preserves all existing boot, indexing, and native status feedback.
- [x] Keyboard focus order, landmark labels, reduced-motion behavior, and
      narrow-window overflow are tested.
- [x] Components use CSS Modules and shared tokens only.

## References

- `mockup_v3/src/App.tsx`
- `mockup_v3/src/components/{ActionBar,TitleBar,StatusBar}.tsx`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/stores/appStore.ts`
