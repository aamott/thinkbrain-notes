- name: ThemeProvider re-reads theme file from disk on every theme toggle
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/ThemeProvider.tsx
- lines: 127-191
- description: |
    The custom-theme effect's dependency array is `[themeFile, theme]`
    (line 191). The `theme` dependency exists only so the conflict
    `console.info` message (lines 167-170) can reference the user's current
    selection. As a side effect, every change to the user's `appearance.theme`
    dropdown (light→dark→system) while a `themeFile` is active triggers a full
    `readTextFileNative(themeFile)` disk read and `parseThemeFile` re-parse,
    even though neither the file path nor its contents changed.

    This is wasteful I/O on a hot UI path (theme dropdown changes) and
    amplifies the effect-race bug documented in
    `theme-attribute-effect-race-and-stale-base,hard,high.md` — the re-read is
    what causes the attribute to flap back to the file's base after Effect A
    set it to the user's choice.

    The fix: drop `theme` from the dependency array and either (a) read
    `theme` from a ref inside the effect for the log message, or (b) move the
    conflict log out of this effect entirely (it is a cosmetic concern, not a
    correctness one). Better yet, consolidate the attribute ownership as
    described in the race action item so there is only one effect.

    No test measures re-read frequency; `themeInjection.test.ts` does not
    exercise the provider.
- verification: |
    Read `apps/desktop/src/settings/ThemeProvider.tsx` line 191 — dep array
    is `[themeFile, theme]`.
    Read lines 166-172 — `theme` is used only in the `console.info` message
    string; it is not used for the override injection itself.
    Confirmed `readTextFileNative` (native/fs.ts) performs a real Tauri IPC
    read on each call (no caching layer).
