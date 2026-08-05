- name: CSS injection via unescaped theme token values
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/theme.ts
- lines: 318-341 (readTokens value check), /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeInjection.ts:37-49 (buildThemeCss)
- description: |
    Token values are validated in `packages/core/src/theme.ts` only as
    "non-empty string" (lines 321-339). The `themeInjection.ts` `buildThemeCss`
    helper then interpolates these raw values directly into a `<style>` element's
    `textContent`:

      declarations.push(`  ${token}: ${value};`);

    Although `textContent` (not `innerHTML`) prevents HTML/script injection, it
    does NOT prevent CSS injection. A token value such as

      red; } * { color: red } .sensitive-selector { background: url(evil) }

    breaks out of the `:root[data-thinkbrain-theme="<base>"] { ... }` rule and
    injects arbitrary CSS into the app. Token keys are constrained to the
    `KNOWN_THEME_TOKENS` allowlist so they cannot break out, but values are
    unconstrained strings.

    The plan doc (`plans/theme-foundation/pending-importable_themes-med-hard.md`,
    design decision #4) explicitly states "CSS color parsing belongs to the
    desktop layer", but the desktop layer (`themeInjection.ts`) performs no
    color-syntax validation or escaping either — it inserts values as-is with a
    comment "Values are validated non-empty strings from parseThemeFile; insert
    as-is."

    Risk is medium: a user must import the malicious file themselves (no remote
    vector), but themes are shareable artifacts and a crafted `.tbtheme.json`
    could exfiltrate data via CSS `background: url(...)` or hijack the UI. The
    core module is correctly platform-agnostic, so the fix belongs in
    `themeInjection.ts`: either (a) validate each value as a CSS color before
    emitting (the desktop layer can pull in a CSS parser per the design doc), or
    (b) escape `;`, `}`, `{`, and `:` characters in values, or (c) emit
    declarations via `style.sheet.insertRule` / CSSOM instead of string
    interpolation so the browser rejects invalid declarations.

    No test covers a value containing `;` or `}` — `themeInjection.test.ts`
    only uses well-formed HSL strings, and `theme.test.ts` only checks that
    non-string/empty values are dropped.
- verification: |
    Read `packages/core/src/theme.ts` lines 318-341 — value validation is
    `typeof rawValue !== "string"` and `rawValue.length === 0` only.
    Read `apps/desktop/src/settings/themeInjection.ts` lines 37-49 — values
    are interpolated into the CSS string with no escaping.
    Confirmed `themeInjection.test.ts` and `theme.test.ts` contain no test
    with `;` or `}` in a token value.
    Cross-referenced the plan doc design decision #4 which delegates color
    validation to the desktop layer, but the desktop layer does not perform it.
