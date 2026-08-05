- name: Export/import boolean+null results conflate cancel with failure; UI shows no failure feedback
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeImportExport.ts
- lines: 147-152, 184-203
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/SettingsContent.tsx
- lines: 181-221
- description: |
    Two related edge-case gaps that should be fixed together:

    1. `writeThemeExportFile` returns `Promise<boolean>` where `false` means *either*
       "user cancelled the save dialog" *or* "the write failed" (themeImportExport.ts
       lines 144-146 doc). `ThemeToolbar.handleExport` (SettingsContent.tsx 181-189)
       only calls `showStatus("Theme exported.")` when `written === true` and is
       silent on `false`. The inline comment ("the user already saw the dialog
       dismiss") covers the cancel case but NOT the failure case: on a real write
       failure (permission denied, disk full) the dialog did not "dismiss" — the
       write threw, `writeTextFileNative` logged to `console.error` and returned
       `false`, and the user sees **nothing** in the UI. This violates the project's
       "Fail Loudly" rule (AGENTS.md global_rules #5).

    2. `importTheme` returns `null` for *both* "user cancelled the open dialog" and
       "file could not be read" (themeImportExport.ts lines 176-182 doc, lines
       185-189 impl). `ThemeToolbar.handleImport` (SettingsContent.tsx 196-198)
       early-returns on `null` with no message. The docstring at line 177 claims this
       is "fail-loud: an unreadable file is distinct from a parseable-but-invalid
       one" — but it is NOT distinct from cancel; both produce `null` and the user
       sees no feedback for an unreadable file. Only the parseable-but-invalid case
       (which returns a non-null result with diagnostics) is surfaced.

    Suggested fix (do both in one pass): change the return types to a discriminated
    result so cancel is distinguishable from failure, e.g.
    `{ kind: "cancelled" } | { kind: "error", message: string } | { kind: "ok", ... }`
    (or at minimum return `null` for cancel and a `{ error: string }` for failure),
    and have `ThemeToolbar` show a destructive status message on the failure branch.
    The same shape applies to the settings export/import in `settingsImportExport.ts`
    / `SettingsSaveBar.tsx`, which has the identical conflation — fixing it once in a
    shared helper (see the `theme-import-export-duplication` review) covers both.
- verification: |
    Read `writeThemeExportFile` (147-152): single `boolean` return; `writeTextFileNative`
    returns `false` on throw (confirmed in `native/fs.ts` — logs `console.error`,
    returns `false`). Read `handleExport` (SettingsContent.tsx 181-189): only the
    `true` branch shows a message; `false` is silent. Read `importTheme` (184-203):
    both `pickFilePath` null and `readTextFileNative` null return `null`. Read
    `handleImport` (196-198): `null` early-returns with no status. Confirmed the
    docstring at line 177 overstates the "fail-loud" guarantee.
