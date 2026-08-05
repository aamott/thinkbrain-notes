- name: KNOWN_THEME_TOKENS duplicated from tokens.css with brittle count test
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/theme.ts
- lines: 52-99, /media/adam/extex/projects/thinkbrain-notes/packages/core/src/theme.test.ts:285-298
- description: |
    `KNOWN_THEME_TOKENS` is a hardcoded array of 44 token names in
    `packages/core/src/theme.ts` (lines 54-99), cross-referenced by comment to
    `packages/ui/src/styles/tokens.css` ("Update both when tokens change").
    The source of truth is `tokens.css`; the array is a manual copy.

    `theme.test.ts` lines 286-288 pins the count with
    `expect(KNOWN_THEME_TOKENS).toHaveLength(44)`. When a token is added to
    `tokens.css`, three places must be updated in lockstep: the CSS file, the
    `KNOWN_THEME_TOKENS` array, and the test count. There is no automated check
    that the array matches the CSS — a drift is silent (new tokens in CSS are
    simply treated as "unknown" warnings on import until someone remembers to
    update the array).

    This was confirmed by diffing the unique `--tn-color-*` entries in
    `tokens.css` against `KNOWN_THEME_TOKENS`: they currently match (44 each),
    but nothing enforces this.

    Maintainability fix options:
      - Generate `KNOWN_THEME_TOKENS` from `tokens.css` at build time (a small
        script that parses the `:root` block and extracts `--tn-color-*`
        custom properties).
      - Or move the canonical list to a shared JSON/TS constant that both
        `tokens.css` generation and `theme.ts` import.
      - At minimum, replace the `toHaveLength(44)` assertion with a test that
        reads `tokens.css` (or a generated snapshot) and asserts the sets are
        equal, so drift fails the test rather than silently degrading.

    This is low urgency (current state is correct) but medium difficulty to
    fix properly (build-time generation touches the build pipeline).
- verification: |
    Read `packages/core/src/theme.ts` lines 52-99 — hardcoded array with
    "Update both when tokens change" comment.
    Read `packages/core/src/theme.test.ts` lines 285-298 — `toHaveLength(44)`
    and "every token starts with --tn-color-" assertions.
    Ran `grep -oE '"--tn-color-[a-z-]+"' packages/core/src/theme.ts` and
    `grep -n "tn-color" packages/ui/src/styles/tokens.css` and diffed the
    unique sets — both contain 44 matching entries, confirming the manual
    sync currently holds but is unenforced.
