# Desktop Shell Composition

## Goal

Replace the current basic desktop grid with the mockup-v3 shell composition:
title bar, activity bar, optional popouts, editor region, bottom region, and
status bar—using real application state and components.

## Status

Done. Previously marked done in commit `a5f88cf`, then rolled back by `b2124ee
"UI Cleanup"` which deleted `apps/desktop/src/panels/` (BottomRegion,
LeftPopout, RightPopout) and the standalone
`shell/{ActivityBar,TitleBar,StatusBar}.tsx`, leaving a single 805-line inlined
`shell/DesktopShell.tsx`.

The shell has now been decomposed again into focused production components. The current source uses Tailwind utilities, while the binding CSS Modules migration remains open below.
`shell/DesktopShell.tsx` is a slim composition orchestrator that owns only
state, effects, and callbacks; every surface it renders is an extracted
component:

- `shell/` — `shellTypes.ts` (panel ids, action descriptors, `DocumentViewState`),
  `TitleBar.tsx`, `ActivityBar.tsx`, `StatusBar.tsx`, `TabContent.tsx`,
  `IconButton.tsx`, `ResizeHandle.tsx`, `Unavailable.tsx`, `DirtyCloseDialog.tsx`.
- `panels/` — `LeftPopout.tsx`, `RightPopout.tsx`, `BottomPanel.tsx`,
  `PanelTitle.tsx`.

`shell/DesktopShell.test.tsx` covers the composed markup: landmark labels,
activity bar actions, dock popouts and resize handles, and status bar states.

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
- [ ] Production component styling uses co-located CSS Modules backed by shared
      `--tn-*` design tokens, with no Tailwind utility classes or inline styles.
      The completed shell composition remains the behavioral foundation, but the
      current Tailwind v4 utility implementation does not satisfy this binding
      production styling rule; see
      `plans/theme-foundation/pending-surface_styling_migration-med-med.md`.

## References

- `mockup_v3/src/App.tsx`
- `mockup_v3/src/components/{ActionBar,TitleBar,StatusBar}.tsx`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/shell/DesktopShell.tsx` (composition orchestrator)
- `apps/desktop/src/shell/`, `apps/desktop/src/panels/` (extracted components)

## Implementation

`DesktopShell` keeps every stateful concern — tab reducer, open-document map,
dock visibility, theme, dock widths, workspace metadata, desktop-state
restoration, global shortcuts, and the pointer/keyboard resize handlers — and
passes plain callbacks down to presentational components. Dock widths are
published as the `--tn-shell-left-width` / `--tn-shell-right-width` custom
properties on the shell root so popouts size themselves from tokens instead of
inline styles.

The `BottomPanel` id type in `shellTypes.ts` collides with the `BottomPanel`
component in `panels/`, so the shell imports the component as
`BottomPanelContent`.
