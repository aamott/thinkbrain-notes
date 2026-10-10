# Workspace Manager

## Goal

Let users add, launch, remove and delete workspaces from one place — a
"Manage workspaces…" modal reached from the workspace switcher and the
welcome page. Mockup: `plans/workspace-manager/assets/workspace-manager-mockup.html`.

## Scope

- Desktop: **Remove from list** only. Never touches files on disk.
- Android managed vaults: **Delete** (type-the-name confirm) — the only way to
  reclaim their storage.
- Missing folders (unmounted drive, renamed parent) are flagged, not dropped.
- The switcher stays a quick switcher; destructive actions live only in the modal.

## Architecture Decisions

- **One native list.** `list_known_workspaces` returns recents + managed vaults
  as `{ rootPath, name, kind, missing }`, replacing the renderer's path-string
  merge and `split("/")` naming.
- **Forget is a targeted desktop-state update** (`forgetWorkspacePath`), like
  `collapsedGroups`/`workspaceTabs`, so windows can't overwrite each other.
  Windows send only `lastWorkspacePath` on open; Rust promotes it, so a stale
  window can't resurrect a forgotten path. Per-workspace views/tabs are pruned
  by the existing recents bound.
- **Hash-keyed metadata** (`settings/workspace-<hash>.json`, `index/…sqlite3`,
  `sync/workspace-<hash>.git`, `backups/workspace-<hash>/`): kept on remove (re-adding
  restores history), wiped on delete.
- **Modal, not a tab.** Each window is one workspace; a cross-workspace list
  belongs above windows. Phone renders it full-screen.

## Status

- ✅ Native list, forget, managed delete — `known_workspaces_backend`
- ✅ Manage workspaces modal (desktop + phone) — `manage_workspaces_modal`
- ✅ Lift switching controller out of the explorer; unwind selector portal — `lift_workspace_switching`
  - Selector placement kept as-is: `ui.workspaceSelectorPlacement` (title bar or panel headers) on desktop; always in the drawer on phone.
- ⬜ Focus an already-open workspace window — `focus_open_workspace_window`
- ⬜ Show in file manager (needs opener plugin) — `reveal_workspace_folder`
