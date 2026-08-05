# Modular Settings System

## Goal

Replace the current minimal settings implementation with a declarative,
modular settings architecture. Adding a new setting should be as simple as
defining its schema in one place — the UI, persistence, and validation
auto-populate from the definition.

## Design

- Settings are defined as a registry of `SettingDefinition` objects, each
  specifying: key, type (string, boolean, number, enum, path), label,
  description, default value, category, and optional validation.
- The Settings tab (opened in the main editor area as a regular tab) renders
  sections and controls automatically from the registry. No manual layout
  per setting.
- Categories group settings visually (e.g., "Editor", "Appearance", "Git",
  "AI", "Workspace"). New categories appear when a setting registers one.
- Settings are scoped: app-level (stored in OS app-data) or workspace-level
  (stored in workspace app-data, not the vault). The UI shows both with clear
  scope indicators.

## Acceptance Criteria

- [ ] `SettingDefinition` type in `packages/core` with key, type, label,
      description, default, category, scope, and validation.
- [ ] Settings registry in `packages/core` that extensions can contribute to.
- [ ] Settings tab auto-generates form controls from the registry:
      - Boolean → toggle switch
      - Enum → dropdown select
      - String → text input
      - Number → number input with optional min/max
      - Path → text input with browse button
- [ ] Adding a new setting requires only adding a `SettingDefinition` — no
      UI code changes needed.
- [ ] Search/filter in the settings tab.
- [ ] Settings changes are persisted immediately and take effect without
      restart.
- [ ] Settings tab opens as a normal tab in the editor area (not a modal).

## Architecture Notes

- The settings registry lives in `packages/core/src/settings.ts` so mobile
  can reuse it.
- The desktop settings tab lives in `apps/desktop/src/settings/`.
- Validation runs on write; invalid values show inline errors and are not
  persisted.

## Dependencies

- `ui-shell` tab registry (done) — settings already opens as a tab.
