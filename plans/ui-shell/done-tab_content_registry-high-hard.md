# Tab Content Registry

## Goal

Implement persistent tab state and a pluggable desktop tab registry so the
title bar can host editor, preview, settings, and future feature views.

## Status

The prior desktop-side implementation was retired with the old UI. The
platform-neutral contract in `packages/core/src/layout/index.ts` remains the
base, and a fresh `apps/desktop/src/tabs/` implementation now provides the
desktop reducer, registry metadata, CodeMirror editor surface, and tests.

## Acceptance Criteria

- [x] `packages/core/src/layout/` exports platform-neutral `TabKind`, `Tab`,
      layout preferences, and a registry contract with no React/DOM imports.
- [x] Desktop registers `editor`, `preview`, and `settings` components; `graph`
      and `browser` render explicit unavailable states until their owners ship.
- [x] Opening a note selects/creates its editor tab without losing existing
      unsaved-document behavior; tab title, dirty marker, close, activation,
      and nearest-neighbor selection work correctly.
- [x] Closing a dirty editor requires the existing save/discard/cancel contract
      before the tab is removed.
- [x] Registration has an extension contribution seam without letting core know
      React components; unit tests cover registry and tab-reducer invariants.

## References

- `mockup_v3/src/components/{TitleBar,EditorArea}.tsx`
- `mockup_v3/src/data/mockData.ts`
- `packages/core/src/layout/index.ts` (still present)
- `apps/desktop/src/shell/DesktopShell.tsx` (currently uses a hardcoded tab array)

## Implementation

`tabModel.ts` and `tabRegistry.ts` are deliberately renderer-neutral. The
shell binds registered kinds to fresh desktop surfaces, lazily loading the
CodeMirror editor and assistant panel to keep the startup chunk compact.
