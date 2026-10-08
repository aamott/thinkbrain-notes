# `context.settings.set` persists every staged change, not just the extension's key

- **Urgency:** med
- **Difficulty:** med
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/desktopExtensionHost.ts`
- **Lines:** 307–313 (calls `useSettingsStore.getState().setSettingImmediately`)

## Description

`set` delegates to `setSettingImmediately`, which calls `saveSettings()` —
and `saveSettings` (settingsStore.ts:287–313) validates and writes **all**
staged changes, not just the extension's key. Two consequences:

1. An extension's `set` silently flushes unrelated user edits the user hasn't
   chosen to save yet. `setSettingImmediately`'s docstring accepts this for
   palette commands ("the Settings tab and the palette are not usually driven
   at the same time"), but extensions can write on a timer or an event — a much
   weaker guarantee.
2. If the save fails — e.g. another staged key fails validation, or the key is
   workspace-scoped and no workspace is open — the extension's key stays in
   `stagedChanges`. That produces a phantom dirty state the user never made,
   and a later "Reset" in the Settings tab silently reverts the extension's
   value and fires its `onDidChange` listeners. `set` resolves regardless
   (documented D81 behavior), so the extension never learns the write failed.

## Recommendation

Add a scoped write path to the settings store (e.g.
`setSettingImmediately(key, value)` writing only that key, or a
`saveSettings(keys)` variant), then have `set` use it. That file is owned
outside this review scope; alternatively document the coupling on
`DesktopExtensionSettings.set`'s docstring until the store grows the API.

## Verification

Read desktopExtensionHost.ts:307–313, settingsStore.ts:287–313 (`saveSettings`
partitions and persists the whole `stagedChanges` map; on failure the key
remains staged per lines 357–379, 392–399), and the `setSettingImmediately`
docstring at settingsStore.ts:154–161 acknowledging the co-persistence for its
original caller.
