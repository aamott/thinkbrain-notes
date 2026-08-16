# Clean Up Journal Mockup Assets

## Goal

Remove the HTML mockup files in `plans/journal-calendar/assets/` once the journal-calendar epic's active stories are complete. These mockups (~5,100 lines across 5 files) were design references during planning and are no longer needed once the features ship.

## Files to remove

- `journal-panel-mockup.html` (1,625 lines)
- `journal-panel-mobile-mockup.html` (1,163 lines)
- `journal-calendar-tab-mockup.html` (1,044 lines)
- `journal-field-editor-mockup.html` (1,026 lines)
- `journal-entry-mockup.html` (762 lines)

## Prerequisites

All `pending-*` stories in `plans/journal-calendar/` must be done or cancelled first. This story is the last item in the epic.

## Acceptance Criteria

- [ ] All journal-calendar stories are done or cancelled.
- [ ] Mockup files are deleted.
- [ ] No remaining references to the mockups in story files or code.
