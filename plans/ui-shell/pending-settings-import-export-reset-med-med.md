# Story 6: Settings Import/Export + Per-Section Reset

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).
Read that file first for the 10 binding design decisions and architecture
overview. Also read [Story 2](./pending-settings-store-persistence-high-med.md)
(store) and [Story 3](./pending-settings-tab-nav-controls-high-hard.md) (tab UI).

## Goal

Add full app-settings export to a JSON file, import from a JSON file with
validation, and per-section "Reset to defaults" buttons.

## Scope

**In scope:**
- Export: "Export settings" action (in the save bar or a menu) writes all
  app-scoped settings to a JSON file via a Tauri save dialog.
- Import: "Import settings" action reads a JSON file via a Tauri open dialog,
  validates against the registry, and stages the values for review before
  saving.
- `portable: false` settings (path-type by default) trigger an export warning
  dialog: "Some settings (N) may not work on another machine. Export anyway?"
- Per-section "Reset section to defaults" button in each section header in the
  content area. Reverts just that section's staged values to defaults.
- Workspace settings are not included in export.

**Out of scope:**
- Per-module export.
- Settings sync across machines.
- Export format versioning (the JSON includes the settings version from the
  store).

## Acceptance Criteria

- [ ] "Export settings" action writes all app-scoped settings to a JSON file
      via a Tauri save dialog.
- [ ] Exported JSON is pretty-printed and includes the settings version.
- [ ] If any `portable: false` settings have non-default values, an export
      warning dialog appears before saving: "N settings may not work on
      another machine. Export anyway?" with Continue/Cancel.
- [ ] "Import settings" action opens a Tauri open dialog, reads the JSON
      file, validates keys against the registry, and stages the values in
      `settingsStore.stagedChanges`.
- [ ] Invalid keys in the imported file are silently ignored (with a count
      shown in a toast or status message: "Imported N settings, ignored M
      unknown keys").
- [ ] Imported values are staged, not immediately saved — the user reviews
      and clicks Save.
- [ ] Each section header in `SettingsContent` has a "Reset to defaults"
      button that reverts just that section's staged values to the registry
      defaults.
- [ ] Reset to defaults only affects staged changes — it doesn't write to
      disk. The user still needs to Save.
- [ ] Component tests for: export action, import action, portable warning,
      per-section reset.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## File References

- `apps/desktop/src/settings/settingsStore.ts` — store from story 2 (has
  `resetSection`).
- `apps/desktop/src/settings/SettingsContent.tsx` — content area from story 3
  (add reset buttons to section headers).
- `apps/desktop/src/settings/SettingsSaveBar.tsx` — save bar from story 4
  (add export/import buttons).
- `apps/desktop/src/native/commands.ts` — check for existing Tauri dialog
  commands (save/open file dialog).
- `packages/core/src/settings/registry.ts` — registry for validating imported
  keys and extracting defaults.

## Implementation Notes

- Check `apps/desktop/src/native/commands.ts` and
  `apps/desktop/src-tauri/src/commands/` for existing Tauri dialog commands.
  If save/open file dialogs don't exist yet, use the `@tauri-apps/plugin-dialog`
  API directly from the native bridge (add a new command in `commands.ts`).
  Follow the existing pattern of routing through `native/`.
- The export JSON format should be: `{ "version": N, "settings": { ... } }`
  where `settings` is the flat key-value map of app-scoped settings.
- Import validation: check each key against the registry. Known keys are
  staged; unknown keys are counted and ignored. Type mismatches (e.g. string
  where number expected) are also ignored with a count.
- The per-section reset button should be small and unobtrusive — a text link
  or small icon button in the section header, not a large button.
- Export/import buttons can live in the save bar (as small icon buttons) or
  in a "..." menu in the save bar. Keep the save bar clean.
