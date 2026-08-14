- name: settingsStore.ts is 607 lines — over the 500-line preference
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsStore.ts
- lines: 1-607
- description: |
    `settingsStore.ts` is 607 lines, exceeding the AGENTS.md "< 500 lines
    preferred" guideline (but under the 800-line hard limit). The file
    bundles several distinct concerns:
      1. The registry instance and module registration (lines 42-57).
      2. The `SettingsStoreGateway` interface and native default
         (lines 63-103).
      3. The store state/action types (lines 109-165).
      4. Pure helpers: `resolveEffectiveValue`, `effectiveSettingValue`,
         `scopeOfKey`, `partitionByScope`, `computeDirty` (lines 171-276).
      5. The `createSettingsStore` factory with the `loadSettings`,
         `stageChange`, `saveSettings`, `resetStaged`, `resetSection`,
         `setSettingImmediately` actions (lines 295-599).
      6. The default `useSettingsStore` singleton (line 607).

    The pure helpers (item 4) are already exported and used by
    `desktopExtensionHost.ts` and `SettingsContent.tsx`. They have no
    dependency on the store factory or the gateway, so they can move to a
    separate `settingsHelpers.ts` (or `effectiveValue.ts`) without changing
    any import that already uses the exported names — only this file and
    `desktopExtensionHost.ts` would update their import paths.

    Moving ~110 lines of helpers out would bring `settingsStore.ts` to ~497
    lines, just under the preference, and keep each file focused on one
    concern (helpers vs. store factory). The `resolveEffectiveValue` /
    `effectiveSettingValue` functions are the natural extraction unit since
    they are the cross-module public API.

    This is a "split one file into N tiny modules" only if the extracted
    module is not independently coherent — but `resolveEffectiveValue` is
    already a documented public API with multiple external consumers, so the
    extraction is coherent, not arbitrary.
- verification: |
    `wc -l settingsStore.ts` → 607. AGENTS.md says "< 500 lines preferred".
    Grep confirms `effectiveSettingValue` is imported by
    `apps/desktop/src/extensions/desktopExtensionHost.ts` (line 41) and
    `resolveEffectiveValue` by `SettingsContent.tsx` (line 27) and
    `ThemeSectionControls.tsx` (line 15) — external consumers that would
    benefit from a focused helper module.
