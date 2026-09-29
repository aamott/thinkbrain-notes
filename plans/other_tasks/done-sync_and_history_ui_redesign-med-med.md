# Sync and History UI Redesign

Consolidate sync menus, rename "Decisions needed" to "Sync conflicts" with header menu, and transition from whole-repository restore to document-level version history with git diff comparison.

## Context & Motivation
- Two permanent sync-related icons on the left Action rail ("Decisions needed" and "Saved versions") cause navigation bloat.
- Repository-wide restore does not match how users work with notes; users need single-document version history with visual git diff comparison.
- "Decisions needed" is renamed to "Sync conflicts", featuring a `...` header menu with "Sync settings" and a grayed-out "Sign in with GitHub".

## Design
Follow `plans/other_tasks/sync_ui_mockup.html` — **Approach 3 (Right Inspector + Quick Diff Tab)** specifically. History timeline lives in the right Inspector (top-right Action items menu on desktop, `ActionItemsMenu` on mobile), with a "Compare Diff" action that opens the chunked diff viewer.

## Tasks

### 1. Rename "Decisions needed" -> "Sync conflicts" & Add Header Menu
- [x] Update `builtInDesktopPanels` in `apps/desktop/src/panels/panelRegistryModel.tsx`:
  - Change label for `"conflicts"` panel from `"Decisions needed"` to `"Sync conflicts"`.
- [x] Update `ConflictsPanel.tsx`:
  - Change header title and section aria-label to `"Sync conflicts"`.
  - Update empty state to "No sync conflicts".
  - Add `...` menu to panel header:
    - "Sync settings" option (opens settings tab / sync section).
    - "Sign in with GitHub" option (disabled, grayed out with tooltip / "Soon").
- [x] Update tests and copy assertions that check for "Decisions needed".

### 2. Transition from Left-Rail "Saved versions" to Document History in Action Items / Inspector
- [x] Remove `"history"` from left-side `builtInDesktopPanels` (or register as document-scoped right inspector panel / action).
- [x] Add Document Version History to Right Panel Contributions / Action Items menu:
  - Accessible via top-right Action items menu on Desktop (`TitleBar`).
  - Accessible via `ActionItemsMenu` (`...`) on Mobile (`PhoneHeader`).
  - Scoped to active document note.
- [x] Connect single-document history to Git Diff View (similar to `MergeTab` chunk comparison):
  - List document revisions.
  - Option to view diff against current document.
  - "Restore this version" action.

### 3. Mobile Updates
- [x] In `PhoneShell` and `ActionItemsMenu.tsx`:
  - Update menu items to reflect "Sync conflicts" and note-scoped "Version history".
- [x] In `PhoneHub` / Drawer:
  - Remove redundant history entry, show "Conflicts" when active.

### 4. Verification
- [x] Run `pnpm qa` (tests, linter, typecheck).
