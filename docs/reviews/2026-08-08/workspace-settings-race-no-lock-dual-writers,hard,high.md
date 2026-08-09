- name: Workspace settings writes have no mutation lock and two uncoordinated RMW writers
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/settings.rs
- lines: 133-152 (Rust commands); /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/workspaceSettings.ts lines 56-72; /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsStore.ts lines 393-411
- description: |
    `read_workspace_settings` and `write_workspace_settings` (settings.rs:133-152)
    perform no locking, unlike the app-settings commands which hold
    `APP_SETTINGS_MUTATION_LOCK` (settings.rs:75-87). Two separate frontend code
    paths do read-modify-write on the same workspace-settings file without
    coordination:

    1. `workspaceSettings.ts` `writeWorkspaceSettings` (lines 56-72) reads the
       current file, parses it, merges in `{ ...base, ...settings }` (only the
       `showHidden` field), and writes the result back. This is the legacy path for
       the explorer's show-hidden toggle.

    2. `settingsStore.ts` `saveSettings` (lines 393-411) serializes dynamic
       workspace settings via `serializeDynamicWorkspaceSettings`, which preserves
       non-setting keys from `rawWorkspaceSettingsJson`, and writes the result
       through `gateway.writeWorkspaceSettings`.

    Both paths read the file, modify in memory, and write back. If they interleave
    (e.g. the user toggles show-hidden while a dynamic settings save is in flight, or
    two windows edit the same workspace), the second writer's read happens before
    the first writer's write commits, so the second write clobbers the first. The
    dynamic serializer preserves unknown keys from its captured
    `rawWorkspaceSettingsJson` snapshot, but that snapshot is stale by the time the
    write lands, so `showHidden` written by path 1 can be silently reverted by path
    2's older snapshot, and vice versa.

    The app-settings path avoids this with `APP_SETTINGS_MUTATION_LOCK`; the
    workspace-settings path needs the same treatment, and the two frontend writers
    need to either funnel through a single serializer or serialize their RMW
    sequences.
- verification: |
    Read settings.rs read_workspace_settings (lines 133-139) and
    write_workspace_settings (lines 142-152) and confirmed neither acquires a lock,
    while read_app_settings/write_app_settings (lines 73-88) both acquire
    APP_SETTINGS_MUTATION_LOCK. Read workspaceSettings.ts writeWorkspaceSettings
    (lines 56-72) and confirmed it does its own RMW. Read settingsStore.ts
    saveSettings (lines 393-411) and confirmed it writes via the gateway with a
    snapshot from rawWorkspaceSettingsJson, independently of the
    workspaceSettings.ts path.
