# Verify Selective Restore UX

Depends on: `pending-save_selective_restore-high-hard.md`

## Goal

Make the full-screen selective editor usable and unambiguous across desktop,
phone, keyboard, and assistive-technology layouts.

## Acceptance Criteria

- Inline remains the responsive default below 720px of comparison-container
  width and explicit user layout choice remains stable.
- Desktop checks around 850px and 1024px keep shell width contained, Action
  items visible, and horizontal overflow inside the diff viewport.
- Phone-width layout keeps the working result, changed-region actions, save,
  and navigation reachable without page-level horizontal overflow.
- Accessible names distinguish baseline, recorded source, and editable result.
- Text and controls communicate change direction without relying on color.
- Draft edits survive layout and application-tab switching in browser-level
  tests.

## Files

- `apps/desktop/src/sync/CodeMirrorDiff.test.tsx`
- `apps/desktop/src/sync/VersionDiffTab.test.tsx`
- `apps/desktop/e2e/app.spec.ts`
