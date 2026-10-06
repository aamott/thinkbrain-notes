- name: WorkspaceExplorerView takes 24 flat props; dialogs deserve grouping
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/WorkspaceExplorerView.tsx
- lines: 18-42, 243-297
- description: |
  The view signature lists 24 fields, including four separate error strings,
  three booleans that only gate dialogs (createManagedWorkspaceOpen,
  managedStorageNoticeOpen, importFromGitOpen), and the pending* pair for
  delete/extension confirms. Grouping into `editing = { renaming, creating,
  inlineCreateError, pendingExtensionConfirm, extensionConfirmError }` and
  `dialogs = { pendingDelete, createManagedWorkspaceOpen, ... }` would make the
  interface read as state + tree + editing + dialogs + actions instead of a
  wall. Alternatively, if managed-workspace concerns are extracted (see
  explorer-managed-workspace-coupling), most of the dialog props leave with it.
- verification: Counted WorkspaceExplorerViewProps members; the render's bottom
  third is five conditionally-mounted dialogs.
