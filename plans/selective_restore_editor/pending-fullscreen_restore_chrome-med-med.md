# Use Full-Screen Restore Chrome

Depends on: `../restore_workflow/pending-restore_tab_identity-high-easy.md`

## Goal

Make restore feel like a normal workspace tab rather than a card embedded above
an editor.

## Acceptance Criteria

- The large in-content title and explanatory card are removed.
- Workspace breadcrumbs carry restore context and the right side of the shared
  header holds layout, legend, and restore actions.
- The comparison owns the remaining vertical space like an editor.
- Header controls wrap or collapse accessibly at phone width without reducing
  the diff viewport to an unusable height.
- Conflict, file editor, settings, and media-viewer headers are unchanged.
- Restore instructions remain available to assistive technology without
  permanent large prose.

## Files

- `apps/desktop/src/shell/WorkspaceHeaderBar.tsx`
- `apps/desktop/src/shell/DesktopShell.tsx`
- `apps/desktop/src/shell/phone/PhoneHeader.tsx`
- `apps/desktop/src/sync/VersionDiffTab.tsx`
