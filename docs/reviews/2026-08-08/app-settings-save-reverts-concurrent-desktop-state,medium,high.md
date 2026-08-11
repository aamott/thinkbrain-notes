- name: Saving settings can revert desktop state written since the app started
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsStore.ts
- lines: settingsStore.ts:277 (snapshot), 432-437 (serialize), 452-454 (write)
- description: |
    What is left of the earlier "three write paths with divergent semantics"
    finding. The two semantic divergences it named are fixed — the TS fallback
    and Rust now agree on `recentWorkspacePaths` (both merge) and on
    `activeTabId` (an explicit null clears on both sides) — and the same
    stale-snapshot problem has been fixed for *workspace* settings. The app
    document still has it.

    `settingsStore.saveSettings` serializes the whole app-settings document from
    `state.rawAppSettingsJson`, which is captured once when settings load
    (line 277) and never re-read before the write. `serializeDynamicAppSettings`
    preserves the nested `desktopState` key from that snapshot, so the value it
    preserves is the one that was on disk at load time.

    `update_desktop_state` writes to the same document every time a tab opens or
    closes, a panel is resized, or a workspace is opened. Both writes take
    `APP_SETTINGS_MUTATION_LOCK`, so neither tears the file — but the lock does
    not span the store's read (at load) and its write (at save), so a save
    rewrites the document with a `desktopState` from before every change made
    since the app started. Symptom: change any setting, restart, and the open
    tabs / panel widths / active tab are the ones from the previous launch.

    The fix has a worked precedent in the tree as of this review's session:
    `workspace/workspaceSettingsFile.ts` re-reads the document immediately
    before revising it, serializes the writers in this window through one chain
    per file, and carries the document it read as an `expected` precondition
    that `write_workspace_settings` checks under a lock before writing —
    rejecting a stale write with `settings.workspace_conflict` so the caller can
    recompute. Applying the same shape to `write_app_settings` closes this, and
    would also let `desktopState.ts`'s TS fallback path share the mechanism
    instead of keeping its own `fallbackUpdateQueue`.
- verification: |
    Read settingsStore.ts: `rawAppSettingsJson` is set from the load-time read
    (line 277) and passed to `serializeDynamicAppSettings` at save (lines
    432-437) with no intervening re-read; `gateway.writeAppSettings` (line 453)
    writes that document. Read settings.rs `write_app_settings` and
    `update_desktop_state`: both take APP_SETTINGS_MUTATION_LOCK, so each
    command is atomic, but the store's read happens in a different command
    entirely. Not reproduced in a running app — this is a read of the code, and
    the symptom above is predicted, not observed.
