# Workspace Manager — Completed Work

Shipped stories from the workspace-manager epic, folded per the compaction
policy.

- `known_workspaces_backend` — one native `list_known_workspaces` returns
  recents then managed vaults as `{ rootPath, name, kind, missing }`; missing
  folders are kept and flagged, never silently dropped. `forgetWorkspacePath`
  is a targeted desktop-state update so windows can't overwrite each other.
  `delete_managed_workspace` (Android) deletes only direct children of
  `vaults/` and wipes their hash-keyed metadata.
- `manage_workspaces_modal` — "Manage workspaces…" modal reachable from the
  switcher and the welcome page; modal on desktop, full-screen on phone.
  Remove-from-list offers an Undo toast; managed delete requires
  type-the-name confirm; the current workspace can't be removed or deleted.
- `lift_workspace_switching` — switching controller and its dialogs lifted to
  a shell-level context; the portal/outlet machinery was deleted. Placement
  setting kept: `ui.workspaceSelectorPlacement` (title bar | panel headers)
  on desktop, always in the drawer on phone. Superseded
  `ui-shell/workspace_selector_portal_simplify`.
