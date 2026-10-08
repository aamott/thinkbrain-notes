# Story: Known-workspace list, forget, managed delete (native)

## Acceptance

- [ ] Recents keep absolute paths whose folder is missing (no silent drop on read).
- [ ] `forgetWorkspacePath` desktop-state update removes the path from recents
      and `lastWorkspacePath`; its views/tabs are pruned.
- [ ] Renderer sends only `lastWorkspacePath` on open/launch.
- [ ] `list_known_workspaces` returns recents (recency order) then remaining
      managed vaults, with `kind` and `missing`.
- [ ] `delete_managed_workspace` (Android) deletes only a direct child of
      `vaults/`, releases its search connection, then wipes its hash-keyed metadata.
- [ ] Rust + TS tests; `pnpm qa` clean.

## Files

`src-tauri/src/commands/{settings,workspace_managed,search}.rs`, new
`workspace_known.rs`, `src/native/commands.ts`, `src/workspace/workspaceAdapter.ts`,
`src/settings/desktopState.ts`, `src/shell/useWorkspaceLifecycle.ts`.
