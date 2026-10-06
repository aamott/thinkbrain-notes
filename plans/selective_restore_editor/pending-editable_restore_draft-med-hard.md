# Editable Restore Draft

Depends on: `pending-fullscreen_restore_chrome-med-med.md`
Depends on: `../restore_workflow/pending-refuse_stale_restore-high-hard.md`

## Goal

Represent a customized restore as a persistent, editable tab-owned document.

## Acceptance Criteria

- `Customize restore` creates a result initialized from the current file while
  retaining immutable current-baseline and recorded-source texts.
- Editing marks the restore tab dirty and participates in ordinary
  save/discard/cancel close behavior.
- Draft text, selection, undo history, and scroll position survive inline/split
  switching and switching to another application tab.
- Reopening the same customized restore activates its existing draft rather
  than replacing it.
- Refreshing after a stale-current refusal preserves the user's draft and
  clearly presents the new baseline.
- Read-only Restore remains read-only and allocates no draft state.

## Files

- `apps/desktop/src/tabs/tabModel.ts`
- `apps/desktop/src/shell/useShellState.ts`
- `apps/desktop/src/sync/CodeMirrorDiff.tsx`
- `apps/desktop/src/sync/VersionDiffTab.tsx`
