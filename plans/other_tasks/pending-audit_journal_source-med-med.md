# Audit journal/ Source for Bloat

## Goal

`apps/desktop/src/journal/` is ~4,000 source lines + ~3,800 test lines — second largest feature surface. Audit for feature-creep bloat, over-testing, and opportunities to consolidate.

## Scope

- Identify files that can be merged or simplified.
- `JournalFieldDefinitionsControl.tsx` (499 lines) and `JournalPanel.tsx` (481 lines) are the largest — check if they can be split.
- Check for duplicated logic between journal panel, row, header, and field definitions.
- Flag any dead code or unused exports.

## Acceptance Criteria

- [ ] Report filed with specific file-level findings and recommended actions.
- [ ] No behavior changes in this task — implementation is a follow-up.
