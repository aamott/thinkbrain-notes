# Fresh-Shell Workspace Open

## Goal

Let a person choose a workspace from the empty Explorer, restore the most
recent workspace and Explorer visibility after restart, and display a
read-only, truthful tree of its current entries.

## Acceptance Criteria

- [x] The empty Explorer has an accessible **Open workspace** action that uses
      the Tauri directory picker and handles cancellation without an error.
- [x] The selected directory goes through `open_workspace` and
      `list_workspace_entries`; its name and entries replace the empty state.
- [x] The last successfully opened root and whether Explorer is open persist
      in app settings outside the vault and restore safely on startup.
- [x] Missing, moved, or unreadable saved workspaces fall back to the empty
      Explorer with a clear, dismissible error; no stale tree is shown.
- [x] Workspace paths and filesystem operations remain behind the native
      command adapter; UI components do not call Tauri `invoke` directly.
- [x] Unit/E2E coverage verifies cancel, successful open, restore, and
      Explorer open/close behavior.

## References

- `apps/desktop/src/native/commands.ts`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/shell/`
- `apps/desktop/src/workspace/`

## Current implementation

The fresh shell uses the Tauri directory picker through `WorkspaceDesktopApi`,
then asks the native `open_workspace` and `list_workspace_entries` commands for
the root name and tree. `DesktopState` stores the last successful root and
Explorer visibility outside the vault, restoring both on startup. A saved root
that is unavailable clears the remembered root and presents a dismissible
error without rendering stale entries. The reducer and app browser tests cover
cancellation, successful open, restoration, and Explorer open/close state.
