- name: themeService.ts is dead code — delete it
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeService.ts
- lines: 1-32
- description: |
    `themeService.ts` defines and exports `themeService` (a `ThemeService` backed by `invokeNativeCommand("read_app_settings")` / `invokeNativeCommand("update_app_theme", { theme })`), but it is imported by NOTHING in the app source.

    Grep for `from\s+["'].*themeService["']` across `apps/desktop/src` returns zero matches. The only references to the string `themeService` are:
      - `themeService.ts:32` (the export itself)
      - `ThemeProvider.tsx:17` (a doc comment saying theme is now read "instead of the legacy `themeService`")
      - `plans/ui-shell/done-shell_theme_control-high-easy.md` (a historical plan doc)

    `ThemeProvider` now reads theme from the Zustand settings store (`useSettingsStore((s) => s.getEffectiveValue("appearance.theme"))`, ThemeProvider.tsx:38) and stages changes via `stageChange("appearance.theme", newTheme)` (line 75). The legacy `themeService` is fully superseded.

    The Rust command `update_app_theme` it depends on is still declared in `native/commands.ts:159`, so removing the TS file alone is safe; if the Rust command is also unused it can be removed separately (out of scope for this review).

    Leaving dead code violates the maintainability rule ("Maintainability is king") and risks a future contributor wiring theme persistence back through it, bypassing the staged-save design.

- verification: |
    grep `themeService` across apps/desktop/src → only the file itself + a comment in ThemeProvider.tsx.
    grep `from\s+["'].*themeService["']` across apps/desktop/src → no matches (no importer).
    grep `update_app_theme` → declared in native/commands.ts:159 and used only inside themeService.ts:12,28.
    Read ThemeProvider.tsx fully — it uses useSettingsStore, never imports themeService.
