# Show Hidden Toggle

## Goal

Add a toggle that lets users show dot-prefixed entries (`.git`, `.obsidian`,
etc.) in the explorer tree. Currently these are always hidden by
`is_hidden_name` in the Rust listing, with no way to reveal them.

## Acceptance Criteria

- [x] A "Show hidden" toggle is available in the explorer header.
- [x] When enabled, `list_workspace_entries` returns dot-prefixed entries.
- [x] When disabled, dot-prefixed entries are hidden (current behavior).
- [x] The preference is persisted per-workspace (workspace settings, not
      global app settings) and restored on workspace reopen.
- [x] Toggling re-lists entries and rebuilds the tree without reopening the
      workspace.
- [x] Hidden entries, when shown, are visually distinguishable (e.g. dimmed).

## File References

- `apps/desktop/src-tauri/src/commands/workspace.rs` — `is_hidden_name` and
  `collect_workspace_entries` hardcode the dot-prefix skip; added an
  `include_hidden: bool` parameter to `list_workspace_entries` and
  `collect_workspace_entries` (passed through the recursive call).
- `apps/desktop/src/native/commands.ts` — `list_workspace_entries` command
  now declares `includeHidden: boolean` in its args type.
- `apps/desktop/src/workspace/workspaceAdapter.ts` —
  `listWorkspaceEntries(rootPath, includeHidden)` passes the flag through.
- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — added `showHidden`
  state, an Eye/EyeOff toggle button in the header, passes `includeHidden`
  to all `listWorkspaceEntries` call sites, and dims dot-prefixed tree nodes
  with `opacity-60`.
- `apps/desktop/src/workspace/workspaceSettings.ts` — new helper wrapping
  `read_workspace_settings` / `write_workspace_settings` to persist the
  `showHidden` preference per workspace with safe fallback to defaults.
- `apps/desktop/src/workspace/workspaceSettings.test.ts` — unit tests for
  the settings helper (parse fallbacks, read/write through the native bridge).
