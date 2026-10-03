- name: Explorer state lives in ~15 useState hooks with four parallel error channels
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/WorkspaceExplorer.tsx
- lines: 81-102, 149-181
- description: |
  WorkspaceExplorer mixes a useReducer (phase/snapshot/entries/error) with
  ~15 loose useState hooks (contextMenu, renaming, creating, pendingDelete,
  pendingExtensionConfirm, inlineCreateError, extensionConfirmError,
  actionError, busy, expandedFolders, showHidden, moreMenuOpen,
  accessCapabilities, managedWorkspacePaths, three dialog-open flags) plus five
  refs synced in one effect to dodge stale closures. Errors split across
  state.error, actionError, inlineCreateError, and extensionConfirmError —
  rendered by two near-identical blocks in the view. Consolidate the transient
  UI state into the reducer (or a small state machine for the create/rename/
  confirm flows), collapse error display into one <ActionError> component, and
  consider a `useLatest` hook to replace the five synced refs.
- verification: Read the state declarations and clearWorkspaceState (183-195),
  which manually resets 11 of them; the actionError JSX is duplicated at view
  lines 165-167 and 194-196.
