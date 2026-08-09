- name: NativeDesktopStateUpdate TS type missing fields Rust accepts; activeTabId null-clearing mismatch
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/native/commands.ts
- lines: 231-238 (TS type); /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/settings.rs lines 37-56, 357-360
- description: |
    Two related contract mismatches between the TS frontend and the Rust backend for
    `update_desktop_state`:

    1. The TS `NativeDesktopStateUpdate` interface (commands.ts:231-238) only declares
       six fields: `lastWorkspacePath`, `recentWorkspacePaths`, `explorerOpen`,
       `leftPanelWidth`, `rightPanelWidth`, `bottomPanelOpen`. The Rust
       `DesktopStateUpdate` struct (settings.rs:37-56) accepts three additional fields
       — `development_extension_directories`, `open_tabs`, `active_tab_id` — and the
       TS `DesktopStateUpdate` type (desktopState.ts:34-44) sends them. The
       `nativeDesktopStateGateway.updateDesktopState` (desktopState.ts:70-72) passes
       the full `DesktopStateUpdate` to `invokeNativeCommand`, which is typed against
       the narrower `NativeDesktopStateUpdate`. At runtime the extra fields are sent
       over IPC and serde picks them up, but the TS type lies about what is accepted,
       so any code reading the typed update object would not see those fields. This is
       a leaky abstraction that will cause bugs when a caller relies on the typed
       shape.

    2. `active_tab_id` null-clearing semantics differ. TS desktopState.ts:198 sets
       `activeTabId: update.activeTabId === undefined ? state.activeTabId : update.activeTabId`,
       so an explicit `null` clears the active tab. Rust settings.rs:357-360 uses
       `update.active_tab_id.and_then(|id| id.filter(|id| !id.is_empty())).or(current.active_tab_id)`.
       When the frontend sends `activeTabId: null`, serde decodes it as `Some(None)`,
       `and_then` yields `None`, and `.or(current.active_tab_id)` restores the
       previous value — so the Rust path silently ignores a request to clear the
       active tab. Note `last_workspace_path` (settings.rs:327-330) handles this
       correctly via `Some(path) => path.as_deref().and_then(nonempty_workspace_path)`,
       which yields `None` for `Some(None)` and does NOT fall back to current. The
       `active_tab_id` handling is inconsistent with that pattern.
- verification: |
    Read commands.ts NativeDesktopStateUpdate (lines 231-238) and confirmed it omits
    three fields present in Rust DesktopStateUpdate (settings.rs:37-56) and TS
    DesktopStateUpdate (desktopState.ts:34-44). Read settings.rs:357-360 and confirmed
    `active_tab_id` uses `.or(current.active_tab_id)` which restores the prior value
    when the update sends `Some(None)`, contradicting TS semantics at
    desktopState.ts:198.
