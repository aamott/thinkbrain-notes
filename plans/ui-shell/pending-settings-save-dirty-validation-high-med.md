# Story 4: Save Bar + Dirty State + Validation Errors

**Status:** pending · **Urgency:** high · **Difficulty:** med

## Epic

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).
Read that file first for the 10 binding design decisions and architecture
overview. Also read [Story 2](./pending-settings-store-persistence-high-med.md)
(store) and [Story 3](./pending-settings-tab-nav-controls-high-hard.md) (tab UI).

## Goal

Add the sticky save/reset bar at the bottom of the settings tab, wire the
dirty indicator to the tab system, and display inline validation errors on
save.

## Scope

**In scope:**
- `SettingsSaveBar.tsx` — sticky bar at the bottom of the settings content
  area. Shows dirty count. Save button writes all staged changes. Reset
  button reverts to last-saved state.
- Tab dirty indicator — when staged changes exist, the Settings tab shows the
  dirty dot (reusing existing tab dirty state).
- `DirtyCloseDialog` integration — closing the settings tab while dirty
  triggers the existing dialog: "Save / Discard / Cancel".
- Inline validation errors — when `saveSettings()` returns validation
  diagnostics, display them inline next to the offending setting controls.
- Save button is disabled when not dirty. Reset button is disabled when not
  dirty.

**Out of scope:**
- Search/filter (story 5).
- Import/export (story 6).
- Per-section reset (story 6).

## Acceptance Criteria

- [ ] `SettingsSaveBar` renders at the bottom of the settings content area,
      sticky on scroll.
- [ ] Save button shows "Save" (or "Save (N)" with dirty count when N > 0).
      Disabled when not dirty.
- [ ] Reset button shows "Reset" or "Discard". Disabled when not dirty.
- [ ] Clicking Save calls `settingsStore.saveSettings()`. On success, staged
      changes clear and the bar updates. On validation failure, errors
      display inline.
- [ ] Clicking Reset calls `settingsStore.resetStaged()`. Staged changes
      clear and controls revert to last-saved values.
- [ ] Settings tab shows the dirty dot when `settingsStore.isDirty` is true.
      Dot clears when saved or reset.
- [ ] Closing the settings tab while dirty triggers `DirtyCloseDialog` with
      "Save / Discard / Cancel" options. Save writes then closes. Discard
      closes without saving. Cancel returns to the tab.
- [ ] Validation errors from `saveSettings()` display inline next to the
      offending setting control, with the diagnostic message and `role="alert"`.
- [ ] After fixing a validation error and re-saving, the error clears.
- [ ] Component tests for: save bar disabled states, save action, reset
      action, dirty indicator, validation error display.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## File References

- `apps/desktop/src/settings/settingsStore.ts` — store from story 2.
- `apps/desktop/src/settings/SettingsTab.tsx` — tab component from story 3.
- `apps/desktop/src/settings/SettingsContent.tsx` — content area from story 3.
- `apps/desktop/src/shell/DirtyCloseDialog.tsx` — existing dirty close dialog.
- `apps/desktop/src/shell/DesktopShell.tsx` — tab close logic, dirty state
  integration.
- `apps/desktop/src/tabs/tabModel.ts` — tab dirty state model.

## Implementation Notes

- The save bar should be part of `SettingsTab`'s layout, not a separate
  overlay. It sits below the content area, always visible (sticky).
- The dirty dot on the tab: check how `DesktopShell.tsx` tracks dirty state
  for file tabs. The settings tab needs to report its dirty state the same
  way. This may require a small extension to the tab model to support
  non-file dirty sources.
- The `DirtyCloseDialog` is already used for unsaved file changes. Wire the
  settings tab into the same close-intercept flow.
- Validation errors: `settingsStore.saveSettings()` should return the
  diagnostics (or store them in state). The content area reads them and
  renders error messages next to the relevant controls.
- Use `role="alert"` for inline error messages so screen readers announce
  them.
