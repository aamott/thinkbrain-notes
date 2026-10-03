- name: Managed-workspace onboarding is coupled into the file explorer
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/WorkspaceExplorerView.tsx
- lines: 263-297, 304-371; WorkspaceExplorer.tsx 96-102, 282-298
- description: |
  The explorer view owns Android managed-vault creation
  (CreateManagedWorkspaceDialog), the uninstall-warning ManagedStorageNotice,
  the GitLinkImportDialog, accessCapabilities probing, and managedWorkspacePaths
  listing — ~200 lines that are workspace switching, not file exploration.
  Extract a `workspaceSwitching`/`WorkspaceOnboarding` module (component +
  hook) so WorkspaceExplorerView renders: header, path/name row, tree, context
  menu, delete/extension dialogs. This also shrinks WorkspaceExplorerActions —
  createManagedWorkspace, openGitLinkImport, launchWorkspace,
  setCreateManagedWorkspaceOpen, setImportFromGitOpen, setManagedStorageNoticeOpen
  are all switching concerns.
- verification: Read the dialog/notice helpers at view bottom and the managed-
  workspace useCallback chain in the explorer; none touch the tree.
