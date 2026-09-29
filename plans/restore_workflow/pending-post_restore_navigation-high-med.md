# Complete The Restore Flow

## Goal

Return the user to the restored document after a successful preview restore.

## Acceptance Criteria

- Success closes the restore tab, activates the existing document tab or opens
  one, and reloads the restored contents.
- A transient confirmation identifies the restored file without occupying a
  tab.
- A failed or refused restore keeps the preview open and displays the error.
- Direct Restore from the Version history inspector keeps the inspector open
  and refreshes its list.
- Desktop and phone navigation select the same resulting document.
- Tests cover an already-open file, a closed file, the last remaining tab,
  failure, and a dirty file that must save before restore.

## Files

- `apps/desktop/src/shell/useShellState.ts`
- `apps/desktop/src/shell/TabContent.tsx`
- `apps/desktop/src/sync/VersionDiffTab.tsx`
- `apps/desktop/src/shell/StatusBar.tsx`
