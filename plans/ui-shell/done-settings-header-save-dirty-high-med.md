# Story 4: Header Bar Save + Dirty State + Validation

## Status

Verified the Story 3 header-bar migration: header Save/Reset states and store actions, per-section reset, inline validation alerts, autosave mode, settings-tab dirty-dot synchronization, and DirtyCloseDialog Save/Discard/Cancel flows all pass. Added integrated DesktopShell tests for the settings dirty dot and dirty-close decisions; no production changes were needed, and `settingsStore.ts` and `DesktopShell.tsx` remain unchanged.

## Epic

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).
Read that first for the 14 binding design decisions and architecture overview.
Also read [Story 3](./done-settings-responsive-header-high-hard.md).

## Context

Save, dirty state, validation, and `DirtyCloseDialog` integration all work
today via `SettingsSaveBar.tsx`. Story 3 moves Save/export/import to the
header bar. This story verifies the store interactions, dirty indicator, and
validation display still work correctly in the new header bar layout, and
updates tests.

## Scope

**In scope:**
- Verify Save button in header bar calls `saveSettings()`, shows "Save (N)",
  disables when clean, shows "Saving…" when in-flight.
- Verify the header Reset button calls `resetStaged()` and the per-section
  Reset button calls `resetSection()`; both are disabled when clean.
- Verify dirty dot on the settings tab still works after the layout change.
- Verify `DirtyCloseDialog` still triggers on close while dirty.
- Verify inline validation errors still display next to controls.
- Update all affected tests.

**Out of scope:** Search (story 5), new features.

## Acceptance Criteria

- [x] Save in header bar: "Save" or "Save (N)", disabled when clean, "Saving…"
      when in-flight.
- [x] Header Reset calls `resetStaged()`; the per-section Reset calls
      `resetSection()` and both are disabled when clean.
- [x] Dirty dot on tab when `isDirty`. Clears on save or reset.
- [x] Close while dirty triggers `DirtyCloseDialog`: Save/Discard/Cancel.
- [x] Validation errors display inline with `role="alert"`. Clear on re-save.
- [x] Autosave mode: Save/Reset hidden, "Autosave enabled" label shown.
- [x] All tests updated and passing.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## File References

- `apps/desktop/src/settings/settingsStore.ts` — store (unchanged).
- `apps/desktop/src/settings/SettingsTab.tsx` or `SettingsHeaderBar.tsx` —
  Save button (from story 3).
- `apps/desktop/src/settings/SettingsContent.tsx` — Reset button, validation
  errors.
- `apps/desktop/src/shell/WorkspaceHeaderBar.tsx` — pattern to match.
- `apps/desktop/src/shell/DirtyCloseDialog.tsx` — existing.
- `apps/desktop/src/shell/DesktopShell.tsx` — tab close, dirty state.
- `apps/desktop/src/tabs/tabModel.ts` — tab dirty state model.

## Implementation Notes

- The store interactions are unchanged — only the UI location of the buttons
  moves. Focus on test updates.
- Match `WorkspaceHeaderBar`'s save button behavior.
- If the dirty dot or `DirtyCloseDialog` integration breaks due to the layout
  change, trace through `DesktopShell.tsx`'s dirty state tracking.
