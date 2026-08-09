- name: recentWorkspacePaths replace-vs-merge mismatch between TS and Rust desktop state update
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/desktopState.ts
- lines: 182-185 (TS); /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/settings.rs lines 331-337
- description: |
    When `update.recentWorkspacePaths` is explicitly provided, the TS and Rust sides
    apply it with different semantics:

    - TS (desktopState.ts:182-185): `update.recentWorkspacePaths === undefined
      ? promoteRecentWorkspace(state.recentWorkspacePaths, update.lastWorkspacePath)
      : normalizeWorkspacePaths(update.recentWorkspacePaths)` — when the update
      supplies the list, the stored list is REPLACED with the normalized incoming
      list (plus the lastWorkspacePath promotion baked into
      `normalizeWorkspacePaths`).

    - Rust (settings.rs:331-337): `Some(paths) => merge_recent_workspace_paths(
      &current.recent_workspace_paths, normalize_workspace_paths(paths, None))` —
      when the update supplies the list, the incoming list is MERGED with the
      current list (incoming first, then current, deduped, truncated to
      MAX_RECENT_WORKSPACES) via `merge_recent_workspace_paths` (settings.rs:481-485).

    So a caller that sends an explicit `recentWorkspacePaths` expecting replacement
    gets a merge on the Rust path (the production path, since
    `nativeDesktopStateGateway.updateDesktopState` is defined) but a replacement on
    the TS fallback path (used only when the gateway lacks `updateDesktopState`).
    The two paths produce different persisted state for the same input, violating the
    "single source of truth" intent of routing updates through the native command.
- verification: |
    Read desktopState.ts applyDesktopStateUpdate (lines 173-200) and confirmed the
    `recentWorkspacePaths` branch replaces when provided. Read settings.rs
    apply_desktop_state_update (lines 321-362) and confirmed the
    `recent_workspace_paths` branch calls `merge_recent_workspace_paths`, which
    extends the incoming list with the current list (settings.rs:481-485) rather than
    replacing it.
