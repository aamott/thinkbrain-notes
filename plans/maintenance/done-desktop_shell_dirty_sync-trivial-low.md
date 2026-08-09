# Desktop Shell Settings Dirty Sync

## Goal

Avoid dispatching the settings tab dirty action when unrelated tabs change. The effect
only needs the settings dirty flag and whether a settings tab exists, not the entire
tab array reference.

## Files

- `apps/desktop/src/shell/DesktopShell.tsx` — derive a boolean such as
  `hasSettingsTab = tabState.tabs.some((tab) => tab.id === "settings")` and depend on
  `[settingsIsDirty, hasSettingsTab]` instead of `[settingsIsDirty, tabState.tabs]`.
- `apps/desktop/src/shell/DesktopShell.dirtySync.test.tsx` — focused regression coverage
  with a reducer dispatch spy for unrelated tab array changes and settings-tab
  presence/dirty-flag synchronization. (Separate file to keep the existing
  `renderToStaticMarkup` composition tests untouched.)

## Reproduction / verification

- With a settings tab open, open or close an unrelated Markdown tab while the settings
  dirty flag is unchanged. The current effect runs again because `tabState.tabs` is a
  new array reference, then dispatches a no-op `setDirty`.
- Use a dispatch spy or a focused helper test to verify unrelated tab mutations do not
  dispatch; verify opening/closing the settings tab and changing `settingsIsDirty`
  still synchronize the dot/dialog state.
- Run focused shell tests, `pnpm typecheck`, and `pnpm lint`.

## Acceptance criteria

- [x] Dirty synchronization dispatches only when `settingsIsDirty` or settings-tab
      presence changes.
- [x] Settings dirty dot and dirty-close behavior remain correct.
- [x] Opening, activating, or closing unrelated tabs does not cause a redundant dirty
      dispatch.

## Manual checks

- Open Settings, stage a change, then open/close a Markdown tab; confirm the Settings
  dirty dot is unchanged and the close dialog still appears.
- Close Settings, change unrelated tabs, reopen Settings, and verify the current dirty
  state is reflected.

## Automated tests

- Shell regression test with a dispatch spy for unrelated tab array changes.
- Existing settings dirty-dot and dirty-close tests remain green.

## Non-goals

- Do not alter tab reducer semantics or settings dirty-state calculation.
- Do not change the dirty-close dialog UX or panel persistence.
