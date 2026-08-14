- name: ThemeProvider and themeImportExport manually inline effective-value resolution instead of calling resolveEffectiveValue
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/ThemeProvider.tsx
- lines: 64-96
- description: |
    `ThemeProvider.tsx` (lines 64-96) manually inlines the
    `staged > appValues > default` resolution for both `appearance.theme` and
    `appearance.themeFile`:

    ```ts
    const themeFromStore =
      "appearance.theme" in staged
        ? staged["appearance.theme"]
        : "appearance.theme" in appValues
          ? appValues["appearance.theme"]
          : "system";
    ```

    `themeImportExport.ts` `buildThemeExport` (lines 167-171) does the same for
    `appearance.themeFile`:

    ```ts
    const configured =
      "appearance.themeFile" in state.stagedChanges
        ? state.stagedChanges["appearance.themeFile"]
        : state.appValues["appearance.themeFile"];
    ```

    The codebase already has a pure, exported `resolveEffectiveValue` function
    (`settingsStore.ts` lines 201-218) that encapsulates this exact precedence
    rule. `SettingsContent.tsx` (line 225) and `ThemeSectionControls.tsx`
    (lines 113-119, 125-131) both call it correctly. The comment in
    `ThemeProvider.tsx` (lines 56-63) explains why `getEffectiveValue` (the
    store action) isn't used in a selector — that is correct — but
    `resolveEffectiveValue` (the pure function) can be called directly with the
    subscribed raw maps, exactly as `ThemeSectionControls` does.

    The risk of keeping the inline copies is drift: the `themeImportExport`
    version omits the `default` fallback (`null` for `themeFile`), so if the
    store ever holds neither staged nor app values for the key (e.g. before
    load completes), it returns `undefined` instead of `null`, and the
    `typeof configured === "string"` guard (line 173) saves it — but only by
    luck. `resolveEffectiveValue` would return the registry default (`null`)
    consistently.

    Fix: import `resolveEffectiveValue` and `appSettingsRegistry` in both
    files and replace the inline resolution with a single call each. This
    shrinks ThemeProvider by ~15 lines and themeImportExport by ~5 lines, and
    keeps one source of truth for the precedence rule.
- verification: |
    Read ThemeProvider.tsx lines 64-96: manual `in` checks against `staged`
    then `appValues` with hardcoded `"system"` / `null` fallbacks.
    Read themeImportExport.ts lines 166-171: same pattern without the default
    fallback.
    Read settingsStore.ts lines 201-218: `resolveEffectiveValue` is the
    exported pure function implementing the same rule.
    Read ThemeSectionControls.tsx lines 112-131: the correct pattern —
    `resolveEffectiveValue(key, stagedChanges, appValues, workspaceValues, def)`.
    Read SettingsContent.tsx lines 225-231: same correct pattern.
