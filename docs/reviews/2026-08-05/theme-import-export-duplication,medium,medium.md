- name: Duplicated import/export + transient-status logic between settings and theme modules
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeImportExport.ts
- lines: 147-152, 184-203 (vs settingsImportExport.ts 105-110, 211-225)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/SettingsContent.tsx
- lines: 137-175 (ThemeToolbar status pattern, vs SettingsSaveBar.tsx 46-82)
- description: |
    The theme import/export module was explicitly written to "mirror the pattern in
    `./settingsImportExport.ts`" (themeImportExport.ts line 4), and the mirroring is
    near-verbatim in two places:

    1. File-write helpers. `writeThemeExportFile` (themeImportExport.ts 147-152) and
       `writeExportFile` (settingsImportExport.ts 105-110) are structurally identical:
       `saveFilePath(title, defaultName)` → null check → `writeTextFileNative(path, json)`.
       The only differences are the dialog title and default filename. A single
       `writeJsonViaSaveDialog(title, defaultName, json)` helper would cover both.

    2. Import preambles. `importTheme` (themeImportExport.ts 184-203) and
       `importSettings` (settingsImportExport.ts 211-225) share the same
       `pickFilePath → null check → readTextFileNative → null check` front matter
       before diverging into their respective parse/stage logic. A shared
       `readPickedFile(title)` returning `string | null` would remove the duplication.

    3. Transient status UI. `ThemeToolbar` (SettingsContent.tsx 137-175) and
       `SettingsSaveBar` (SettingsSaveBar.tsx 46-82) implement the **exact same**
       `statusMessage` state, `statusTimeoutRef`, `clearStatus` callback,
       `showStatus` callback (with the same hardcoded `4000ms` timeout), and the same
       unmount-cleanup `useEffect`. This is ~40 lines duplicated verbatim. A small
       `useTransientStatus()` hook (returning `{ statusMessage, showStatus, clearStatus }`)
       would deduplicate both components and make the timeout duration a single
       constant.

    None of these are bugs, but the duplication is a maintainability liability: the
    status-timeout cleanup logic and the cancel-vs-failure semantics (see the
    separate `theme-import-export-cancel-failure-conflated` review) have to be fixed
    in two places. Per the project's "Maintainability is king" rule
    (AGENTS.md global_rules #3) and the existing precedent of extracting shared
    helpers (e.g. `sectionUtils.ts`, `settingHighlight.ts`), extracting these is
    worth doing in the same pass as the cancel/failure fix.
- verification: |
    Diffed `writeThemeExportFile` against `writeExportFile` — identical structure,
    only `title`/`defaultName` differ. Diffed the `importTheme` and `importSettings`
    preambles — identical 4-line pick+read+null-check sequence. Diffed
    `ThemeToolbar`'s status block (SettingsContent.tsx 137-175) against
    `SettingsSaveBar`'s (SettingsSaveBar.tsx 46-82) — `clearStatus`, `showStatus`,
    the `4000` timeout, and the unmount cleanup effect are character-for-character
    the same apart from the surrounding component name.
