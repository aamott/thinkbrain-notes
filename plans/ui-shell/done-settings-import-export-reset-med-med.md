# Story 6: Settings Import/Export + Per-Section Reset — DONE

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).

## What was built

- `apps/desktop/src/settings/settingsImportExport.ts` — export payload
  builder, file writer, import reader with registry validation.
- `apps/desktop/src/settings/importExportFiles.ts` — Tauri dialog integration.
- Export/import buttons in `SettingsSaveBar.tsx` (to move to header bar in
  story 3).
- Portable warning dialog for `portable: false` settings on export.
- Per-section "Reset to defaults" button in `SettingsContent.tsx` section
  headers.
- Tests: `SettingsImportExport.test.ts`, `importExportFiles.test.ts`.
