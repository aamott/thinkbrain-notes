# Mobile Settings Adapter

## Goal

Implement the mobile `SettingsAdapter` for human-readable JSON application
settings, stored via `AsyncStorage` (or Expo SecureStore for sensitive values).
Settings live in app-data, never in the workspace. Workspace settings are keyed
by workspace identity, mirroring desktop.

## Acceptance Criteria

- [ ] `SettingsAdapter` implementation lives in `apps/mobile/src/adapters/`.
- [ ] Implements the `SettingsAdapter` interface from `packages/core`.
- [ ] Loads and persists application settings as JSON.
- [ ] Workspace settings keyed by workspace identity, stored in app-data.
- [ ] Reuses the shared settings types/shapes from `packages/core`.
- [ ] No settings files written inside the user's workspace.

## References

- `packages/core/src/settings.ts` — shared settings types and shapes
- `plans/technical-decisions.md` — Settings section
- `apps/desktop/src/settings/settingsService.ts` — reference implementation
- `plans/pending-mobile-low-hard.md` — Platform adapter contract
