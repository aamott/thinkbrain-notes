# Story 2: Settings Store + Persistence Evolution

**Status:** pending · **Urgency:** high · **Difficulty:** med

## Epic

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).
Read that file first for the 10 binding design decisions and architecture
overview. Also read [Story 1](./pending-settings-core-types-registry-high-hard.md)
for the types and registry this story builds on.

## Goal

Create the desktop settings Zustand store and evolve the persistence layer to
use the registry's dynamic key-value model instead of the fixed-shape
`AppSettings` interface. Wire up the existing Rust commands for app and
workspace settings.

## Scope

**In scope:**
- `settingsStore.ts` Zustand store managing: loaded values (per scope), staged
  changes, dirty state (boolean + dirty key count), active section, search
  query.
- Load/save flows through existing Rust commands
  (`read_app_settings`, `write_app_settings`, `read_workspace_settings`,
  `write_workspace_settings`).
- Evolve `packages/core/src/settings.ts` to serialize/parse dynamic key-value
  settings backed by the registry, instead of the fixed `AppSettings` shape.
- Central migration list integration — the registry's `SettingMigration[]`
  runs on load.
- `ThemeProvider.tsx` updated to read theme from the new store instead of the
  old `AppSettings.theme` path.
- Existing `desktopState.ts` (panel widths, recent workspaces) continues to
  work alongside — it's separate shell layout state.

**Out of scope:**
- Settings tab UI (story 3).
- Save bar UI (story 4).
- Controls (story 3).
- Search (story 5).
- Import/export (story 6).

## Acceptance Criteria

- [ ] `settingsStore` Zustand store with:
      - `appValues: Record<string, unknown>` — loaded app-scoped settings.
      - `workspaceValues: Record<string, unknown>` — loaded workspace-scoped
        settings (null when no workspace open).
      - `stagedChanges: Record<string, unknown>` — pending changes keyed by
        full setting key.
      - `isDirty: boolean` — derived from stagedChanges being non-empty.
      - `dirtyCount: number` — count of staged changes.
      - `activeSection: string | null` — currently selected nav section.
      - `searchQuery: string` — search filter text.
      - Actions: `loadSettings()`, `stageChange(key, value)`,
        `saveSettings()`, `resetStaged()`, `resetSection(sectionId)`,
        `setActiveSection(id)`, `setSearchQuery(query)`.
- [ ] `loadSettings()` reads app settings (and workspace settings if a
      workspace is open), runs migrations, merges with registry defaults,
      and populates the store.
- [ ] `saveSettings()` validates all staged changes, writes app-scoped and
      workspace-scoped changes through their respective Rust commands, clears
      staged changes on success.
- [ ] `resetStaged()` reverts all staged changes to the last-saved values.
- [ ] `resetSection(sectionId)` reverts staged changes for settings in that
      section only.
- [ ] `packages/core/src/settings.ts` evolved: `serializeAppSettings` and
      `parseAppSettings` now work with the registry's dynamic key set instead
      of hardcoded `theme`/`editor` fields. The migration infrastructure
      (version tracking, `MigrationStep[]`) is preserved.
- [ ] `ThemeProvider.tsx` reads theme from `settingsStore` instead of the old
      `AppSettings.theme` path. Theme changes in the store immediately apply.
- [ ] `desktopState.ts` continues to work unchanged (panel widths, recent
      workspaces, explorer open, bottom panel open).
- [ ] Unit tests for: store actions (stage, save, reset, resetSection),
      load/save flow with mocked gateway, migration integration.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## File References

- `packages/core/src/settings.ts` — existing parse/serialize/migrate to evolve.
- `packages/core/src/settings/registry.ts` — registry from story 1.
- `packages/core/src/settings/defaults.ts` — default extraction from story 1.
- `packages/core/src/settings/validation.ts` — validation from story 1.
- `apps/desktop/src/settings/desktopState.ts` — existing desktop state, stays
  as-is.
- `apps/desktop/src/settings/ThemeProvider.tsx` — must react to new store.
- `apps/desktop/src/native/commands.ts` — existing Rust command bindings.
- `apps/desktop/src-tauri/src/commands/settings.rs` — existing Rust
  persistence commands.

## Implementation Notes

- The store should use the registry from story 1 to know which keys exist,
  what their defaults are, and which scope they belong to.
- When loading, merge persisted values over registry defaults so missing keys
  get their default value.
- When saving, only write the scope that has staged changes (don't rewrite
  workspace settings if only app settings changed).
- The `DesktopStateGateway` interface in `desktopState.ts` already has
  `readAppSettings` and `writeAppSettings`. The store can use a similar
  gateway pattern for testability.
- Keep `desktopState.ts` and the new `settingsStore.ts` separate. They're
  different concerns: desktopState is shell layout, settingsStore is
  user-facing settings.
