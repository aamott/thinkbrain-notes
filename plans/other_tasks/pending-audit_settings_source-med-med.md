# Audit settings/ Source for Bloat

## Goal

`apps/desktop/src/settings/` is ~4,000 source lines + ~4,900 test lines — the largest feature surface in the app. Audit for feature-creep bloat, over-testing, and opportunities to consolidate.

## Scope

- Identify files that can be merged or simplified.
- Check test-to-source ratio — settings has the highest test ratio in the app (1.2×). Some tests may be over-covering the same paths.
- Look for duplicated logic between settings store, theme provider, and desktop state.
- Flag any dead code or unused exports.

## Acceptance Criteria

- [ ] Report filed with specific file-level findings and recommended actions.
- [ ] No behavior changes in this task — implementation is a follow-up.
