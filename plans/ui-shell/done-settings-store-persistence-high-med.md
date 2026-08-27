# Story 2: Settings Store + Persistence — DONE

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).

## What was built

- `apps/desktop/src/settings/settingsStore.ts` — Zustand store: loaded values
  (per scope), staged changes, dirty state, active section, search query.
  Actions: `loadSettings`, `stageChange`, `saveSettings`, `resetStaged`,
  `resetSection`, `setActiveSection`, `setSearchQuery`.
- `packages/core/src/settings/dynamic.ts` — dynamic key-value
  parse/serialize/migrate, replacing the fixed-shape `AppSettings`.
- `apps/desktop/src/settings/ThemeProvider.tsx` — reads theme from the store.
- `apps/desktop/src/settings/appSettingsFile.ts` — app settings file I/O.
- `apps/desktop/src/settings/workspaceSettingsSerialization.ts` — workspace
  settings serialization.
- Tests: `settingsStore.test.ts`, `appSettingsFile.test.ts`,
  `ThemeProvider.test.tsx`, `themeAdapter.test.ts`.
