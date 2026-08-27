- name: Cross-file interactions between theme.ts, theme.test.ts, and the desktop injection layer
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/theme.ts
- lines: 1-21, 129-135, 529-565
- description: |
    Summary of how `theme.ts` interacts with `theme.test.ts` and the downstream
    desktop layer, with cross-cutting action items that do not belong to a
    single file.

    **1. Safety boundary split between core and desktop (theme.ts lines 8-20,
    129-135, 529-565).**
    `theme.ts` owns two safety checks that the desktop layer cannot perform
    itself: `UNSAFE_VALUE_PATTERN` (blocks `;{}@` and `/*` to prevent CSS
    injection via `themeInjection.ts`'s `${token}: ${value};` interpolation) and
    `isValidCssColorValue` (catches typos/non-colors). The header comment
    explains this well. However, the comment at lines 529-535 says the desktop
    layer "has no diagnostics channel of its own" — this is the justification
    for putting the injection check in core, and it should be verified when the
    desktop layer is touched. If a diagnostics channel is later added to the
    desktop layer, this split should be revisited (the injection check is
    arguably a desktop concern since it depends on `themeInjection.ts`'s
    interpolation format). No code change needed now; this is a note for future
    maintainers.

    **2. `KNOWN_THEME_TOKENS` drift regression test depends on `tokens.css`
    (theme.test.ts lines 416-448).**
    The test reads `packages/ui/src/styles/tokens.css` via `import.meta.url` and
    compares the declared `--tn-color-*` custom properties against
    `KNOWN_THEME_TOKENS`. This is a strong cross-file guard. One gap: the test
    regex `^\s*(--tn-color-[a-z0-9-]+):` (line 431) only matches tokens declared
    at the start of a line with leading whitespace. If `tokens.css` ever uses a
    different declaration style (e.g. tokens inside a layer or a selector block
    with different indentation, or tokens declared via `@property`), the
    regression test would silently under-count. Worth a note but low risk given
    the current CSS structure.

    **3. Bundled preset themes are validated at test time (theme.test.ts lines
    499-524).**
    The preset test reads 8 `.tbtheme.json` files from
    `apps/desktop/src-tauri/presets/themes/` and asserts zero diagnostics. This
    means any false positive in `isValidCssColorValue` that rejects a value used
    by a preset would surface here. The presets currently pass (per the test),
    which gives confidence that common color formats (`hsl`, hex, named colors)
    are handled. However, the presets do not exercise `color-mix`, `oklch`,
    `light-dark`, or `var()` references (the more complex functions), so the
    preset test is not a substitute for the targeted edge-case tests listed in
    `isvalidcolorvalue-testability-and-coverage,easy,medium.md`.

    **4. The false positives in `function-validation-false-positives,medium,high.md`
    are invisible to the preset test.**
    Because the false positives *accept* invalid values (rather than rejecting
    valid ones), the preset test cannot catch them — presets use valid values.
    Only a direct negative test (`rgb(0 0 0) hsl(0 0 0)` should be rejected)
    can catch this. This is why exporting `isValidCssColorValue` for direct
    testing (see companion finding) matters.

- verification: |
    Read theme.ts header (lines 1-21), `UNSAFE_VALUE_PATTERN` (lines 129-135),
    and the `readTokens` unsafe/color checks (lines 529-565). Read the full
    test file and confirmed the `tokens.css` regression test (lines 416-448)
    and preset test (lines 499-524) exist as described. Cross-referenced the
    false-positive finding: the preset test asserts `diagnostics === []` for
    valid themes, so it cannot detect values that are wrongly *accepted*.
