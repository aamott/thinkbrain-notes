- name: ThemeProvider split-effect race leaves stale base attribute and flaps on toggle
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/ThemeProvider.tsx
- lines: 103-191
- description: |
    `ThemeProvider` writes `data-thinkbrain-theme` from TWO separate effects:

      Effect A (lines 111-114): sets `root.dataset.thinkbrainTheme = theme`
        (the user's selection) on every `theme` change.
      Effect B (lines 127-191): reads the theme file async, and on success
        forces `root.dataset.thinkbrainTheme = result.theme.base` (the file's
        base), overriding the user's selection.

    The component's own comment (lines 106-110) admits "React does not guarantee
    effect ordering across re-renders" and relies on Effect B re-applying the
    attribute after injecting overrides. This creates two real bugs:

    1. **Visual flap on theme toggle.** When a custom themeFile is active and
       the user toggles `appearance.theme` (e.g. light→dark), Effect A sets the
       attribute to the user's choice, then Effect B (which lists `theme` in its
       deps at line 191) re-reads the file from disk, re-parses it, and sets the
       attribute back to the file's base. The user sees a brief flash and their
       theme selection is silently overridden — the dropdown change appears to do
       nothing while a themeFile is active. The `console.info` at line 167 is the
       only signal.

    2. **Stale base attribute when a theme file breaks.** If a previously-valid
       themeFile is replaced with a malformed file (or deleted and recreated
       broken), Effect B's parse-failure branch (lines 147-158) calls
       `removeThemeOverrides()` but does NOT reset `data-thinkbrain-theme` back
       to the user's `theme` selection. Effect A only re-runs when `theme`
       changes — if only the file content changed, Effect A does not fire, so
       the attribute stays at whatever base the previous successful file forced
       (e.g. "dark") even if the user's selection is "light". The UI is now in
       an inconsistent state: dark base palette active with no custom overrides,
       user selected "light".

    Both bugs stem from splitting the "effective base" computation across two
    effects with an async gap. The fix is to consolidate into a single effect
    (or a `useMemo` + one effect) that computes the effective base
    synchronously from `{ theme, themeFileBase }` where `themeFileBase` is
    cached from the last successful parse, and applies it once. The async file
    read should update a `useState` base override rather than mutating the DOM
    imperatively from inside a `.then()`.

    No test covers either scenario: `ThemeProvider.tsx` has no test file in
    this commit, and the `themeInjection.test.ts` tests only exercise
    `injectThemeOverrides`/`removeThemeOverrides` in isolation, not the
    provider's effect interaction.
- verification: |
    Read `apps/desktop/src/settings/ThemeProvider.tsx` lines 103-191.
    Effect A (111-114) writes the attribute unconditionally on `theme` change.
    Effect B (127-191) writes the attribute inside an async `.then()` on
    successful parse (line 171) and does NOT write it on the parse-failure
    branch (147-158) or the catch branch (174-182).
    Confirmed Effect B's dep array (line 191) is `[themeFile, theme]`, so a
    `theme`-only change triggers a full file re-read.
    Confirmed no `ThemeProvider.test.tsx` exists in the commit
    (`git show --stat 38bbf41` lists no such file).
