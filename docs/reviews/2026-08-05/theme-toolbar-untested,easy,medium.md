- name: ThemeToolbar UI wiring (status messages, error surfacing, timeout cleanup) has no tests
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/SettingsContent.tsx
- lines: 137-268
- description: |
    `ThemeToolbar` is a non-trivial component (~130 lines): it owns transient status
    state, a `setTimeout`-based auto-clear with unmount cleanup, and branches the
    import result into success-with-warnings, parse-failure-with-first-error, and
    cancel/unreadable cases. None of this is tested.

    The pure logic it calls (`buildThemeExportPayload`, `writeThemeExportFile`,
    `importTheme`) IS well-covered by `themeImportExport.test.ts` (368 lines).
    But the React integration layer — the part most likely to regress silently — is
    not: there is no `SettingsContent.test.tsx`, and the existing
    `SettingsSaveBar.test.tsx` / `SettingsSearch.test.tsx` / `SettingsTab.test.tsx`
    files do not reference `ThemeToolbar`, `handleExport`, `handleImport`, or
    `statusMessage` (confirmed by grep). The commit only added 1 line each to those
    three test files (likely a snapshot/section-id update), not ThemeToolbar cases.

    Critical untested paths:
    - The 4000ms status timeout actually clearing the message (and not firing after
      unmount — the cleanup `useEffect` at lines 167-175 is the kind of code that
      silently breaks).
    - `handleImport` surfacing the first error diagnostic on parse failure
      (SettingsContent.tsx 214-219) — including the fallback
      "Import failed: theme file is invalid." when no error-severity diagnostic
      exists.
    - The warning-count message format
      `Imported theme "X" (N warning(s)).` (lines 203-208).
    - Export showing no feedback on write failure (see the
      `theme-import-export-cancel-failure-conflated` review — a test would have
      caught that gap).

    Suggested fix: add a `SettingsContent.test.tsx` (or `ThemeToolbar.test.tsx`)
    that renders the toolbar with `activeSection === "appearance.theme"`, mocks the
    `themeImportExport` module, and asserts the status messages for each branch plus
    timeout cleanup via `vi.useFakeTimers`.
- verification: |
    Listed the settings test files: `SettingsSaveBar.test.tsx`,
    `SettingsSearch.test.tsx`, `SettingsTab.test.tsx`, `ThemeProvider.test.tsx`,
    `themeImportExport.test.ts`. Grepped all of them for `ThemeToolbar`,
    `handleExport`, `handleImport`, `statusMessage` — no matches. Confirmed
    `themeImportExport.test.ts` covers only the pure module, not the component.
    The commit diff shows only +1 line each to the three Settings*.test.tsx files
    (snapshot/section updates), not ThemeToolbar coverage.
