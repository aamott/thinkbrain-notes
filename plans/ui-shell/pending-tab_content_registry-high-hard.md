# Tab Content Registry

## Goal

Implement persistent tab state and a pluggable desktop tab registry so the
title bar can host editor, preview, settings, and future feature views.

## Acceptance Criteria

- [ ] `packages/core/src/layout/` exports platform-neutral `TabKind`, `Tab`,
      layout preferences, and a registry contract with no React/DOM imports.
- [ ] Desktop registers `editor`, `preview`, and `settings` components; `graph`
      and `browser` render explicit unavailable states until their owners ship.
- [ ] Opening a note selects/creates its editor tab without losing existing
      unsaved-document behavior; tab title, dirty marker, close, activation,
      and nearest-neighbor selection work correctly.
- [ ] Closing a dirty editor requires the existing save/discard/cancel contract
      before the tab is removed.
- [ ] Registration has an extension contribution seam without letting core know
      React components; unit tests cover registry and tab-reducer invariants.

## References

- `mockup_v3/src/components/{TitleBar,EditorArea}.tsx`
- `mockup_v3/src/data/mockData.ts`
- `apps/desktop/src/editor/MarkdownEditor.tsx`
- `packages/core/src/index.ts`
