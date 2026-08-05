- name: Cross-cutting — effective theme base is computed in three places with divergent logic
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/ThemeProvider.tsx
- lines: 62-88, 111-114, 127-191; /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeImportExport.ts:90-96
- description: |
    The "effective theme base" (light/dark) is derived in three independent
    places with inconsistent rules:

      1. `ThemeProvider.tsx` lines 62-74: resolves the user's `appearance.theme`
         from the store (staged > appValues > "system"). This is the user's
         *intent*, which may be "system".
      2. `ThemeProvider.tsx` Effect B (lines 161-172): after reading the
         themeFile, forces the attribute to `result.theme.base`, overriding
         #1. The user's "system" intent is discarded when a themeFile is
         active.
      3. `themeImportExport.ts` `readCurrentThemeBase()` (lines 90-96): reads
         the DOM attribute and maps "system" → "light" unconditionally,
         producing the wrong base for dark-OS users (see
         `export-system-base-mismatch,medium,high.md`).

    These three derivations disagree on what "the current base" means:
    #1 is the user's selection, #2 is the file's declared base, #3 is a
    lossy read of the DOM attribute. There is no single source of truth for
    "what base palette is currently rendered", which is why export captures
    the wrong base and why the provider's two effects fight over the
    attribute.

    Recommended consolidation: introduce a single `useEffectiveThemeBase()`
    hook (or a derived value in the store) that returns `{ base: "light" |
    "dark", source: "user" | "themeFile" }`, computed synchronously from
    `{ userTheme, themeFileBase, systemPrefersDark }`. The provider applies
    this once to the DOM attribute; the export function reads this instead of
    re-deriving from the DOM. This eliminates the effect race, the stale-base
    bug, and the export mismatch in one move.

    This is the cross-cutting fix that subsumes
    `theme-attribute-effect-race-and-stale-base,hard,high.md` and
    `export-system-base-mismatch,medium,high.md`; those files remain useful as
    per-symptom references, but the root cause is the absence of a single
    effective-base derivation.
- verification: |
    Read `ThemeProvider.tsx` lines 62-74 (store resolution), 111-114
    (Effect A attribute write), 161-172 (Effect B attribute override).
    Read `themeImportExport.ts` lines 90-96 (DOM read + system→light map).
    Confirmed the three derivations use different inputs (store value,
    file base, DOM attribute) and different fallback rules.
