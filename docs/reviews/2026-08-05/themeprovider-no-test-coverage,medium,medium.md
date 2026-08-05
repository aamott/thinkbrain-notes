- name: ThemeProvider has no test file covering the themeFile effect lifecycle
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/ThemeProvider.tsx
- lines: 1-208
- description: |
    `git show --stat 38bbf41` lists no `ThemeProvider.test.tsx` in this commit.
    The provider contains the most complex logic in the feature: two
    interacting effects, an async file read with cancellation, attribute
    mutation, override injection/removal, and a conflict log. None of this is
    tested at the integration level.

    Critical untested paths:
      - themeFile set → file read → parse success → overrides injected +
        attribute forced to file base.
      - themeFile set → parse failure → overrides removed (and the stale-base
        bug from `theme-attribute-effect-race-and-stale-base,hard,high.md` is
        not caught).
      - themeFile cleared → overrides removed, attribute reverts to user
        selection.
      - themeFile path changed mid-read → cancellation flag prevents stale
        injection.
      - themeFile read throws → catch branch removes overrides.
      - User toggles `appearance.theme` while themeFile active → the flap and
        redundant re-read (`themefile-redundant-disk-read-on-theme-toggle`)
        are not exercised.

    `themeInjection.test.ts` covers the leaf injection helpers in isolation,
    and `themeImportExport.test.ts` covers the import/export functions, but
    the orchestration layer that ties them together (the provider) is
    unverified. The two bugs documented in the race and stale-base action
    items would likely have been caught by a provider test that asserts the
    `data-thinkbrain-theme` attribute after a parse failure.

    Fix: add `ThemeProvider.test.tsx` using `@testing-library/react` with the
    settings store and `readTextFileNative` mocked, covering at minimum the
    six paths above. Medium difficulty because the provider reads from a
    Zustand singleton and the native fs bridge, both of which need mocking.
- verification: |
    `git show --stat 38bbf41` — no `ThemeProvider.test.tsx` in the changed
    file list.
    `find apps/desktop/src/settings -name "ThemeProvider*"` confirms only
    `ThemeProvider.tsx` exists, no test sibling.
    Read `apps/desktop/src/settings/ThemeProvider.tsx` lines 127-191 — the
    effect lifecycle (success/failure/cancel/clear) has no integration
    coverage.
