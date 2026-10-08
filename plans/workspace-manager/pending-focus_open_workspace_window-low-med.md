# Story: Focus an already-open workspace window

Opening a workspace that another window already shows creates a duplicate
window. The main window's root isn't registered in `WorkspaceWindowRoots`.

## Acceptance

- [ ] Every window's root is known natively (including the main window).
- [ ] `open_workspace_window` focuses an existing window for the same root.
- [ ] Manager shows "Open in another window" + Focus.
