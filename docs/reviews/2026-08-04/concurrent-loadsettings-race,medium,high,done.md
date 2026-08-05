- name: Concurrent loadSettings calls (ThemeProvider vs SettingsTab) can clobber each other
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/ThemeProvider.tsx
- lines: 53-61 (ThemeProvider) and /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/SettingsTab.tsx 34-46
- description: |
    Two independent components call `loadSettings` on mount with no coordination:
      - `ThemeProvider` (line 57): `loadSettings(null)` — loads app settings only, sets `workspaceValues = null` and `workspaceRootPath = null`.
      - `SettingsTab` (line 44): `loadSettings(root)` — loads app + workspace settings.

    `loadSettings` (settingsStore.ts:277-307) is fully async: it `await`s `gateway.readAppSettings()` then optionally `await`s `gateway.readWorkspaceSettings(rootPath)` before a single `set(...)` that wholesale replaces `appValues`, `workspaceValues`, `workspaceRootPath`, `rawAppSettingsJson`, `rawWorkspaceSettingsJson`, and clears `stagedChanges`.

    Race scenarios:
    1. ThemeProvider fires `loadSettings(null)` first; SettingsTab fires `loadSettings(root)` shortly after. Both interleave their `await`s. Whichever `set(...)` runs LAST wins. If ThemeProvider's `set` wins (e.g. its `readAppSettings` resolves after SettingsTab's full app+workspace load), the store ends with `workspaceValues: null` / `workspaceRootPath: null` even though a workspace is open — the Workspace nav group and workspace-scoped settings silently disappear. The `loadedRef`/`loadStartedRef` guards only prevent the *same* component from double-loading; they do NOT prevent the two components from racing each other.
    2. Conversely if SettingsTab wins last, ThemeProvider's load result is discarded — usually fine, but ordering is nondeterministic.
    3. Both calls clear `stagedChanges` on completion. If the user stages a change in SettingsTab between the two `set`s, the later-completing `loadSettings` wipes it with no warning.

    There is no in-flight promise deduplication, no load generation/token, and no mutual exclusion. The store has no `isLoading` flag to gate concurrent loads.

- verification: |
    Read ThemeProvider.tsx:53-61 (loadSettings(null) on mount, guarded only by loadStartedRef).
    Read SettingsTab.tsx:34-46 (loadSettings(root) on mount, guarded only by loadedRef).
    Read settingsStore.ts:277-307 (loadSettings does multiple awaits then a single wholesale set; no concurrency guard, no in-flight promise tracking, clears stagedChanges unconditionally).
    Confirmed both components mount independently (ThemeProvider wraps the app shell; SettingsTab mounts when the settings tab is opened) and both run on first Tauri mount.
