- name: Theme export records wrong base when user is on "system"
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeImportExport.ts
- lines: 90-96, 123-135
- description: |
    `readCurrentThemeBase()` reads `document.documentElement.dataset.thinkbrainTheme`
    and maps anything other than `"dark"` (including `"system"`, missing, or
    unexpected) to `"light"`:

      if (raw === "dark") return "dark";
      return "light";

    When the user's `appearance.theme` is `"system"` and their OS is in dark
    mode, the `data-thinkbrain-theme` attribute is `"system"` (the ThemeProvider
    sets it verbatim at line 113), but the *computed* token values read by
    `readCurrentTokenValues()` are the dark palette (CSS resolves `system` via
    `@media (prefers-color-scheme: dark)`).

    `buildThemeExportPayload()` then produces a `.tbtheme.json` with
    `base: "light"` but dark token values. On re-import, `injectThemeOverrides`
    scopes the overrides under `:root[data-thinkbrain-theme="light"]`, so the
    dark colors only apply when the user is in light mode — the exported theme
    is semantically broken and applies the wrong palette.

    The comment at lines 93-95 acknowledges `"system"` must be mapped to a
    concrete `ThemeBase`, but picks `"light"` unconditionally rather than
    resolving the actual effective palette. The fix is to resolve the effective
    base via `window.matchMedia("(prefers-color-scheme: dark)").matches` when
    the attribute is `"system"` (or missing), returning `"dark"` or `"light"`
    accordingly.

    `themeImportExport.test.ts` has an explicit test (lines 115-118) that
    asserts `readCurrentThemeBase()` returns `"light"` for `"system"` — this
    test encodes the buggy behavior and would need to change. No test covers
    the dark-OS scenario.
- verification: |
    Read `apps/desktop/src/settings/themeImportExport.ts` lines 90-96.
    Read `apps/desktop/src/settings/ThemeProvider.tsx` line 113 — the
    attribute is set to the raw `theme` value including `"system"`.
    Read `apps/desktop/src/settings/themeImportExport.test.ts` lines
    115-118 — the test pins the buggy `"system" → "light"` mapping.
    Confirmed `readCurrentTokenValues()` (lines 62-75) reads computed styles
    which would reflect the dark palette under a dark OS preference.
