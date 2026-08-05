- name: Exporting while on "system" theme records the wrong `base`
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeImportExport.ts
- lines: 90-96, 123-135
- description: |
    `readCurrentThemeBase()` reads `document.documentElement.dataset.thinkbrainTheme`
    and maps "system" (and any unexpected value) to `"light"`. The comment at lines
    83-85 justifies this by saying a `.tbtheme.json` `base` must be concrete (true —
    `ThemeBase` is `"light" | "dark"`), but the chosen concrete value is wrong: it is
    hardcoded to `"light"` regardless of which palette the OS actually resolved to.

    When the user's `appearance.theme` is `"system"` and their OS is in dark mode,
    `ThemeProvider` sets `data-thinkbrain-theme="system"` (or leaves it for the OS),
    and `getComputedStyle` resolves every `--tn-*` token to the **dark** palette's
    values. `readCurrentTokenValues()` therefore captures dark tokens, but
    `readCurrentThemeBase()` returns `"light"`. The exported `.tbtheme.json` ends up
    with `base: "light"` + dark token values — a self-contradictory file.

    On re-import, `ThemeProvider` forces `data-thinkbrain-theme` to the file's
    `base` (`"light"`) and `injectThemeOverrides` scopes the overrides under
    `:root[data-thinkbrain-theme="light"]`. The dark token values are then applied
    on top of the light base palette — not what the user saw when they exported.
    The export is documented as "captures exactly what the user sees"
    (themeImportExport.ts lines 13-17, 116-118), so this is a correctness bug that
    silently produces a non-round-tripping file whenever the user is on "system".

    Fix: when the attribute is `"system"` (or missing), resolve the effective palette
    via `window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"`
    instead of unconditionally returning `"light"`. The existing test at
    themeImportExport.test.ts lines 115-118 asserts the current (buggy) behavior and
    would need updating.
- verification: |
    Read `readCurrentThemeBase()` (lines 90-96) — the "system" branch returns
    `"light"` unconditionally with no OS-pref check. Read `buildThemeExportPayload`
    (lines 123-135) — it pairs this base with `readCurrentTokenValues()`, which
    reads resolved computed styles. Read `ThemeProvider.tsx` (lines 140-172) — on
    import it forces `data-thinkbrain-theme` to `result.theme.base` and scopes
    overrides under that attribute. Confirmed the mismatch: dark tokens + light base
    on export → light base + dark overrides on import.
