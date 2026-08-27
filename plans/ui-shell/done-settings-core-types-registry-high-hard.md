# Story 1: Settings Core Types + Registry + Built-in Modules — DONE

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).

## What was built

- `packages/core/src/settings/types.ts` — `SettingDefinition`,
  `SettingsModule`, `SettingSection`, `SettingType`, `SettingScope`, control
  key types, `portable` field.
- `packages/core/src/settings/registry.ts` — `SettingsRegistry`: module
  registration, `moduleId.key` composition, uniqueness enforcement, lookups,
  migration collection.
- `packages/core/src/settings/defaults.ts` — default extraction per scope.
- `packages/core/src/settings/validation.ts` — validator runner returning
  `SettingsDiagnostic[]`.
- `packages/core/src/settings/dynamic.ts` — dynamic key-value
  parse/serialize/migrate.
- Built-in modules: `appearance` (theme), `editor` (fontSize, lineWrapping),
  `sync` (auto-settle, git remote, etc.).
- Tests: `registry.test.ts`, `validation.test.ts`, `dynamic.test.ts`.
