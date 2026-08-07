# Canvas Management UI

## Goal

Provide UI to create, open, rename, and delete user-owned canvas documents.
Canvases are `.canvas` files in the vault and should be manageable from the file
explorer and a dedicated entry point. Management and tab flows must use the
persistence layer's debounced/batched, atomic saves and explicit conflict
handling.

## Acceptance Criteria

- [ ] "New Canvas" action creates a `.canvas` file in the current folder and
      opens it.
- [ ] `.canvas` files appear in the file explorer with a distinct icon.
- [ ] Opening a `.canvas` file opens the canvas view in a tab.
- [ ] Rename and delete work for `.canvas` files from the explorer context
      menu.
- [ ] Deleting a canvas does not affect referenced notes.
- [ ] Canvas tab integrates with the existing tab/layout system.
- [ ] Reload, close, rename, and delete flows detect external changes or pending
      saves, preserve both versions, and offer explicit reload/resolve without
      silently overwriting the user's canvas; structural auto-merge is deferred.

## References

- `apps/desktop/src/` — file explorer, tab system
- `packages/core/src/` — file operations, canvas persistence
- `plans/wip-workspace-explorer-med-med.md` — explorer integration
