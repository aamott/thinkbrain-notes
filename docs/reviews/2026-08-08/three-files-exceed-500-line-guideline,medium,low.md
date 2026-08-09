- name: Three core files exceed the 500-line guideline (settingsStore.ts, settings.rs, workspace.rs)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsStore.ts
- lines: 1-538 (settingsStore.ts); /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/settings.rs lines 1-636; /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/workspace.rs lines 1-667
- description: |
    Three files in the reviewed set exceed the project's <500-line preferred file
    size guideline (AGENTS.md: "Small, focused files (< 500 lines preferred)"):

    - `apps/desktop/src/settings/settingsStore.ts` — 538 lines. The Zustand store
      factory, gateway, helpers, and all actions live in one file. The workspace
      serialization was already extracted to
      `workspaceSettingsSerialization.ts`, but the store itself still carries the
      app-settings serialization inline usage, the `effectiveSettingValue` helper,
      the `scopeOfKey`/`computeDirty` helpers, and the full `saveSettings` commit
      logic. The `effectiveSettingValue` function is exported for the extension
      settings API and could move to a sibling helper file alongside the
      autosave scheduler.

    - `apps/desktop/src-tauri/src/commands/settings.rs` — 636 lines. Combines the
      Tauri command handlers, the `DesktopState`/`DesktopStateUpdate` structs, the
      versioned read/apply/serialize logic, and the atomic `write_settings_file`
      helper. The desktop-state read/apply/serialize block (lines 202-579) is a
      self-contained unit that could move to a `desktop_state.rs` module.

    - `apps/desktop/src-tauri/src/commands/workspace.rs` — 667 lines. Combines the
      window-root state, the workspace open/list/create/rename/delete commands,
      the path resolution and traversal validation, and the entry-collection
      recursion. The path-resolution helpers (`resolve_workspace_root`,
      `resolve_workspace_entry_path`, `normalize_relative_path`,
      `stable_workspace_hash`) are a natural extraction boundary.
- verification: |
    Read each file in full and noted the line counts: settingsStore.ts 538,
    settings.rs 636, workspace.rs 667 — all above the 500-line guideline in
    AGENTS.md and the desktop/src/AGENTS.md modularity rule.
