# Story 1: Settings Core Types + Registry + Built-in Modules

## Epic

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).
Read that file first for the 10 binding design decisions and architecture
overview.

## Goal

Create the platform-agnostic settings type system and registry in
`packages/core`, including the built-in Appearance and Editor modules that
migrate the existing fixed-shape settings (`theme`, `editor.fontSize`,
`editor.lineWrapping`) to the new registry-based system.

## Scope

**In scope:**
- `SettingDefinition`, `SettingsModule`, `SettingSection` types.
- `SettingsRegistry` with module registration, full-key composition
  (`moduleId.key`), module ID uniqueness enforcement, lookups.
- Default value extraction per scope.
- Validation runner (returns `SettingsDiagnostic[]`).
- Built-in modules: `appearance` (theme setting) and `editor` (fontSize,
  lineWrapping) with their definitions.
- Central migration list type (`SettingMigration[]`).
- `portable` field on `SettingDefinition` (defaults `true`; path types default
  `false`).

**Out of scope:**
- Desktop UI (stories 3-6).
- Zustand store (story 2).
- Persistence evolution (story 2).
- Control components.

## Acceptance Criteria

- [ ] `SettingDefinition` type with: `key` (relative), `type`
      (`boolean` | `string` | `number` | `enum` | `path`), `label`,
      `description`, `default`, `scope` (`app` | `workspace`), `section`
      (section ID), optional `validation`, optional `control` (custom control
      key), optional `portable` (defaults `true`, path defaults `false`),
      optional `min`/`max` (for number), optional `options` (for enum).
- [ ] `SettingsModule` type with: `id`, `label`, `scope`, `sections`
      (recursive `SettingSection[]`), optional `description`.
- [ ] `SettingSection` type with: `id`, `label`, optional `settings`
      (`SettingDefinition[]`), optional `subsections` (recursive
      `SettingSection[]`).
- [ ] `SettingsRegistry` that:
      - Collects modules via `register(module)`.
      - Auto-composes full keys as `moduleId.key`.
      - Enforces module ID uniqueness (throws on duplicate).
      - Provides `getModule(id)`, `getAllModules()`, `getDefinition(fullKey)`,
        `getDefinitionsForSection(sectionId)`, `getModulesByScope(scope)`.
      - Collects `SettingMigration[]` entries via `registerMigration()`.
- [ ] `extractDefaults(registry, scope)` returns a flat
      `Record<string, unknown>` of all default values for that scope.
- [ ] `validateSettings(registry, values)` runs each definition's validator
      and returns `SettingsDiagnostic[]`.
- [ ] Built-in `appearance` module (app scope) with section `appearance.theme`
      containing the `theme` setting (enum: system/light/dark, default system).
- [ ] Built-in `editor` module (app scope) with section `editor.display`
      containing `fontSize` (number, min 10, max 32, default 16) and
      `lineWrapping` (boolean, default true).
- [ ] All types and functions exported via `packages/core/src/index.ts`.
- [ ] Unit tests for: registry registration, key composition, uniqueness
      enforcement, default extraction, validation, built-in module structure.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## File References

- `packages/core/src/settings.ts` — existing types and parse/serialize/migrate
  to preserve. The new types sit alongside in `packages/core/src/settings/`.
- `packages/core/src/index.ts` — export entry point.
- `packages/core/AGENTS.md` — platform-agnostic rules (no React, no Node, no
  DOM).

## Implementation Notes

- Create `packages/core/src/settings/` directory with the files listed in the
  epic's architecture overview.
- The existing `packages/core/src/settings.ts` stays as-is for now. Story 2
  evolves it to use the registry.
- `SettingDefinition.key` is relative (e.g. `"fontSize"`), not the full key.
  The registry composes the full key as `moduleId.key`.
- Section IDs should be unique within a module. Use a path-like convention
  (e.g. `"editor.display"`) for clarity.
- The `portable` field: omit from the type as required, default to `true` in
  extraction logic. Path-type definitions should set `portable: false`.
- Keep files under 500 lines. Split if needed.
