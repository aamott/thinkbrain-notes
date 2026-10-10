# Story: Detach sync engine and watcher before managed-vault delete

From code review of the workspace-manager PR.

`delete_managed_workspace` releases the pooled search connection but not the
sync `Engine` or watcher attached for that root (`watch_workspace` in
`watcher/lifecycle.rs` attaches on a background thread; released by
`unwatch_workspace` on window/workspace close). Reachable cases today —
Android, single window, the open vault can't be deleted — mean no live engine
should remain, but the command itself takes no lifecycle precaution. If an
engine survives (in-flight bootstrap racing the delete, or a leaked attach
after switching workspaces), its sweeper can recreate
`sync/workspace-<hash>.git` after the metadata wipe — silent resurrected
orphans.

Also: body-portaled overlays (`Menu`, `CommandPalette`) are not covered by
`ModalDialog`'s inert — an overlay open over a modal stays focusable and
Escape order is wrong. See `useDismissable`'s overlay stack.

## Acceptance

- [x] `delete_managed_workspace` detaches engine + watcher interest for the
      canonical root before removing files
- [x] Test: deleting a vault with a live attachment leaves no resurrected
      metadata
- [x] Body-portaled overlays join the overlay stack (or document why not)
