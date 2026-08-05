- name: saveSettings correctly preserves desktopState via serializeDynamicAppSettings (confirmed OK)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsStore.ts
- lines: 374-383 (cross-ref packages/core/src/settings/dynamic.ts:145-193, desktopState.ts:124-135)
- description: |
    NOT a bug — confirmation that the new dynamic settings system coexists correctly with the nested `desktopState` key.

    `saveSettings` (settingsStore.ts:376-381) serializes via:
    ```
    const serialized = serializeDynamicAppSettings(merged, appSettingsRegistry, state.rawAppSettingsJson);
    await gateway.writeAppSettings(serialized);
    set({ appValues: merged, rawAppSettingsJson: serialized });
    ```
    `serializeDynamicAppSettings` (dynamic.ts:145-193) starts from `existingRawJson` (the last-loaded raw app settings JSON, stored in `rawAppSettingsJson` at load time, settingsStore.ts:293), parses it, and `Object.assign`s it into `base`. It then removes only *known app-scoped setting keys* from `base` (dynamic.ts:176-180, gated by `knownSettingKeys` built from registry app-scoped defs at 166-172) and writes the new setting values. `desktopState` is NOT a registered setting key, so it is NOT in `knownSettingKeys`, so it is NOT deleted — it survives in `base` and is re-serialized. `version` is re-stamped to `CURRENT_SETTINGS_VERSION` (dynamic.ts:190).

    `desktopState.ts:124-135` reads `appSettings[DESKTOP_STATE_KEY]` ("desktopState") as a nested record — consistent with what `serializeDynamicAppSettings` preserves.

    One minor caveat: `serializeDynamicAppSettings` re-stamps `base.version = CURRENT_SETTINGS_VERSION` (dynamic.ts:190) unconditionally. `desktopState` has its OWN inner `version` field (`DESKTOP_STATE_VERSION = 3`, desktopState.ts:3) nested under `desktopState.version`, which is a different key path from the top-level `version`, so there is no collision. Confirmed safe.

    Edge case to be aware of (not a bug): if `rawAppSettingsJson` is null at save time (e.g. the load failed and `rawAppSettingsJson` stayed null), `serializeDynamicAppSettings` starts with an empty `base` (dynamic.ts:152-162) and the saved file will contain ONLY setting keys + `version` — any pre-existing `desktopState` on disk would be OVERWRITTEN and lost. In practice `loadSettings` sets `rawAppSettingsJson` from `gateway.readAppSettings()` (settingsStore.ts:279,293) and only null if the file was absent, in which case there's no desktopState to preserve. But if a load *error* occurred (catch at 302-306), `rawAppSettingsJson` retains its prior value (set doesn't touch it on error), so a subsequent save could write a stale base. Low risk; noted for completeness.

- verification: |
    Read dynamic.ts:145-193 — base seeded from existingRawJson; only knownSettingKeys removed; desktopState preserved; version re-stamped.
    Read settingsStore.ts:276-307 — rawAppSettingsJson set from gateway.readAppSettings() on successful load.
    Read settingsStore.ts:374-383 — save passes state.rawAppSettingsJson as existingRawJson.
    Read desktopState.ts:124-135 — reads nested desktopState key, matching preserved shape.
    Confirmed no key collision between top-level version and desktopState.version.
