# Canvas Management UI

## Goal

Provide UI to create, open, rename, and delete canvas documents. Canvases are
`.canvas` files in the vault and should be manageable from the file explorer
and a dedicated entry point.

## Acceptance Criteria

- [ ] "New Canvas" action creates a `.canvas` file in the current folder and
      opens it.
- [ ] `.canvas` files appear in the file explorer with a distinct icon.
- [ ] Opening a `.canvas` file opens the canvas view in a tab.
- [ ] Rename and delete work for `.canvas` files from the explorer context
      menu.
- [ ] Deleting a canvas does not affect referenced notes.
- [ ] Canvas tab integrates with the existing tab/layout system.

## References

- `apps/desktop/src/` — file explorer, tab system
- `packages/core/src/` — file operations, canvas persistence
- `plans/workspace-explorer.md` — explorer integration
