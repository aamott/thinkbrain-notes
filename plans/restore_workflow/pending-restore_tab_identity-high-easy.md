# Restore Tab Identity

## Goal

Make a restore preview distinguishable from the ordinary file tab and from
other versions of the same file.

## Acceptance Criteria

- Desktop and phone tab surfaces label the workflow `Restore: <filename>`.
- Desktop and phone breadcrumbs read `Workspace › Restore › <path>`.
- Tooltip and accessible naming include the selected version's date when it is
  known, so two restore tabs for one file are distinguishable.
- Stable tab ids remain keyed by workspace, path, and selected change.
- Existing file, conflict, and settings tab naming is unchanged.

## Files

- `apps/desktop/src/tabs/tabModel.ts`
- `apps/desktop/src/shell/WorkspaceHeaderBar.tsx`
- `apps/desktop/src/shell/phone/PhoneShell.tsx`
