# Settings Directory Audit — 2026-09-21

## File Inventory

**Source: ~42 files, ~5,200 lines. Tests: ~18 files, ~3,100 lines. Ratio: ~1.2×.**

Largest files (all under 800-line limit):
- `settingsStore.ts` (501), `desktopState.ts` (484), `SettingsNav.tsx` (405),
  `ThemeSectionControls.tsx` (324), `SettingsHeaderBar.tsx` (254),
  `themeImportExport.ts` (256), `ThemeProvider.tsx` (249),
  `SettingsContent.tsx` (246), `settingsImportExport.ts` (230).

## Findings

### HIGH: Effective value resolution pattern duplicated across 5 call sites

`resolveEffectiveValue` is called inline in `ThemeProvider.tsx`,
`ThemeSectionControls.tsx`, `themeImportExport.ts`, `SettingsContent.tsx`,
and `settingsStore.ts`. Each site subscribes to the same three raw store
fields (`stagedChanges`, `appValues`, `workspaceValues`) then calls the
resolver. Necessary for React reactivity but repetitive.

**Action:** Create a `useEffectiveValue(key)` hook that encapsulates the
subscription + resolution pattern.

### MEDIUM: `getEffectiveValue` store action — NOT dead code (audit correction)

The initial audit flagged this as dead code. It is NOT — it's used in
`DesktopShell.tsx` (event handler), `TabContent.tsx` (selector), and 18
test assertions. It serves as the non-React entry point for value
resolution (event handlers, tests, extension host). The inline
`resolveEffectiveValue` pattern is used inside React render for
reactivity. Both are needed.

**Action:** None. Keep as-is.

### MEDIUM: `effectiveSettingValue` helper — NOT dead code (audit correction)

Used by `desktopExtensionHost.ts` (4 references) as the extension API's
value resolver. Not redundant — it's the bridge between the extension
host and the settings store.

**Action:** None. Keep as-is.

### MEDIUM: `SettingsTab.test.tsx` has overlapping coverage

498-line integration test covers layout, navigation, controls, remount,
extensions, and workspace root resolution. Some scenarios are also covered
by component-level tests.

**Action:** Extract workspace root resolution tests into a focused file.
Trust component tests for individual pieces.

### LOW: `theme-context.ts` could merge into `ThemeProvider.tsx`

30-line file exists only to avoid a circular dependency. Only imported by
`ThemeProvider.tsx` and `shell/DesktopShell.tsx`.

**Action:** Merge into `ThemeProvider.tsx`, export context and hook from
there.

### LOW: Test setup duplication across 6+ test files

Each test file repeats mock setup, `createRoot`/`act` helpers, and
`SEEDED_APP_VALUES`. Not over-testing, but maintenance burden.

**Action:** Extract a shared `settingsTestHelpers.ts` with common setup.

### NONE: No orphaned code from SettingsSaveBar deletion

Clean removal — no dangling imports or references.

### NONE: No files exceed 800-line limit

### NONE: Desktop state / settings store concurrent writes are intentional

Well-architected pattern for concurrent writers to `app-settings.json`.
