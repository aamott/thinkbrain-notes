- name: DirtyCloseDialog and DeleteConfirmDialog duplicate focus-trap and modal patterns
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/DirtyCloseDialog.tsx
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/WorkspaceExplorer.tsx
- lines: DirtyCloseDialog.tsx 1-141; WorkspaceExplorer.tsx 1063-1116
- description: `DirtyCloseDialog` (shell/DirtyCloseDialog.tsx) and `DeleteConfirmDialog` (inside WorkspaceExplorer.tsx) implement overlapping modal dialog patterns:

  - Both render a `fixed inset-0` overlay with a centered `role="dialog"` `aria-modal="true"` section.
  - Both handle Escape to cancel.
  - Both implement Tab/Shift+Tab focus wrapping within the dialog.
  - Both manage focus on open (DirtyCloseDialog saves and restores focus; DeleteConfirmDialog focuses the cancel button).

  The implementations differ in detail (DirtyCloseDialog has full focus save/restore; DeleteConfirmDialog only focuses cancel on mount and closes on backdrop `onMouseDown`). But the core pattern — modal overlay + focus trap + Escape close + Tab wrapping — is duplicated.

  This is a moderate compaction candidate: a shared `ModalDialog` primitive (overlay + focus trap + Escape + Tab wrapping + optional backdrop click-to-close) could host both dialogs, reducing ~80 lines across the two implementations to ~30 lines of shared logic plus dialog-specific content. However, the differences in focus management (save/restore vs. focus-cancel) and backdrop behavior (none vs. mousedown-close) mean the shared primitive would need options for each.

  Lower priority than the context menu duplication because the dialogs are in different layers (shell vs. workspace) and the behavioral differences are more substantial. Flag as a future opportunity if a third modal dialog is added.

- verification: Read both dialog implementations. Compared structure, focus management, keyboard handling, and backdrop behavior. Confirmed overlapping but not identical patterns.
