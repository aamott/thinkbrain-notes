# Show Hidden Toggle

## Goal

Add a toggle that lets users show dot-prefixed entries (`.git`, `.obsidian`,
etc.) in the explorer tree. Currently these are always hidden by
`is_hidden_name` in the Rust listing, with no way to reveal them.

## Acceptance Criteria

- [ ] A "Show hidden" toggle is available in the explorer header.
- [ ] When enabled, `list_workspace_entries` returns dot-prefixed entries.
- [ ] When disabled, dot-prefixed entries are hidden (current behavior).
- [ ] The preference is persisted per-workspace (workspace settings, not
      global app settings) and restored on workspace reopen.
- [ ] Toggling re-lists entries and rebuilds the tree without reopening the
      workspace.
- [ ] Hidden entries, when shown, are visually distinguishable (e.g. dimmed).

## File References

- `apps/desktop/src-tauri/src/lib.rs` — `is_hidden_name` (line 711) and
  `collect_workspace_entries` (line 620) hardcode the dot-prefix skip; add
  an `include_hidden` parameter to `list_workspace_entries`.
- `apps/desktop/src/native/commands.ts` — `list_workspace_entries` command
  (line 46) needs an `includeHidden` arg.
- `apps/desktop/src/workspace/workspaceService.ts` —
  `listWorkspaceEntries` (line 46) passes the flag through.
- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — add toggle state and
  pass `includeHidden` to listing calls; `handleRefresh` (line 69) and
  `handleOpenWorkspace` (line 52) call `listWorkspaceEntries`.
- `apps/desktop/src/settings/settingsService.ts` —
  `read_workspace_settings` / `write_workspace_settings` for persisting the
  preference per workspace.
- `apps/desktop/src/stores/appStore.ts` — may need a `showHidden` field in
  workspace state.
