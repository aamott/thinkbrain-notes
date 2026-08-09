- name: Cross-file: desktop state has three independent write paths with divergent merge/replace semantics
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/desktopState.ts
- lines: cross-file: desktopState.ts:91-120, settings.rs:202-362, settingsStore.ts:329-476
- description: |
    Desktop state and workspace settings are written through three separate code
    paths whose semantics are not aligned:

    1. `desktopState.ts` `saveDesktopState` (lines 91-120) — the TS fallback path
       (used only when `gateway.updateDesktopState` is absent). Does an in-process
       RMW via `parseAppSettingsRecord` / `applyDesktopStateUpdate` /
       `serializeAppSettingsRecord`, serialized through a module-level
       `fallbackUpdateQueue` promise.

    2. `settings.rs` `update_desktop_state` (lines 91-105) — the native path. Does
       its own RMW under `APP_SETTINGS_MUTATION_LOCK` using
       `apply_desktop_state_update` (lines 321-362), which MERGES
       `recent_workspace_paths` and restores `active_tab_id` on `Some(None)`.

    3. `settingsStore.ts` `saveSettings` (lines 329-476) — writes app-scoped
       settings via `serializeDynamicAppSettings` and `write_app_settings`, which
       preserves the nested `desktopState` key from `rawAppSettingsJson`. This path
       does NOT touch `desktopState` directly, but it rewrites the entire
       app-settings document, so a concurrent `update_desktop_state` write can be
       clobbered if the settingsStore's `rawAppSettingsJson` snapshot predates it.
       The `APP_SETTINGS_MUTATION_LOCK` serializes the writes themselves, but the
       settingsStore's read of `rawAppSettingsJson` (captured at load time, not
       re-read before write) can be stale by the time `write_app_settings` runs,
       so the serialized document may revert a `desktopState` update that landed
       between the settingsStore's load and its save.

    The three paths disagree on `recentWorkspacePaths` (TS fallback replaces, Rust
    merges — see separate finding) and on `activeTabId: null` (TS fallback clears,
    Rust restores the prior value — see separate finding). Any caller using
    `saveDesktopState` gets different persisted state depending on whether the
    native gateway is present (production) or absent (test fallback), which makes
    test-only behavior diverge from production behavior.
- verification: |
    Read desktopState.ts saveDesktopState (lines 91-120) and confirmed the fallback
    RMW and the `fallbackUpdateQueue` serialization. Read settings.rs
    update_desktop_state (lines 91-105) and apply_desktop_state_update (lines
    321-362) and confirmed the merge/restore semantics. Read settingsStore.ts
    saveSettings (lines 329-476) and confirmed it serializes from
    `rawAppSettingsJson` (captured at load, line 277) without re-reading before
    write, so a concurrent desktop-state update between load and save is reverted.
