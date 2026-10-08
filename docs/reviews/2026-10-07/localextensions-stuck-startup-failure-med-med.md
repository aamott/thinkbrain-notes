# No way to forget a permanently broken stored extension directory

- **Urgency:** med
- **Difficulty:** med
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/localExtensions.ts`
- **Lines:** 34–38, 139–157

## Description

`restore()` keeps a stored directory that fails to load (deliberate — the
user fixes it and reloads) and surfaces it via `startupFailures()`. But the
only way to remove a directory from `stored` is `remove(id)`, and `remove`
takes an extension *id* resolved through `directoryOf`, which only finds
*loaded* entries (`bootstrap.entries()`). A directory that never loads has no
entry, no id, and therefore no removal path: it is retried on every launch
and re-reported in the Extensions panel forever. The Extensions panel renders
startup failures as plain error text with no dismiss/forget button
(`ExtensionsPanel.tsx:77–81`).

The only escape today is hand-editing the desktop-state document, which is
also where the directories are persisted
(`desktopExtensionDirectoryStore.ts` → `developmentExtensionDirectories`).

## Recommendation

Add a `forget(directory: string)`-style operation on `LocalExtensions` that
removes the directory from `stored`/the store and clears it from `failures`,
then render a "Remove" affordance next to each startup failure in the
Extensions panel (outside this scope). Alternatively `remove` could accept a
directory as well as an id, but a separate verb keeps the semantics clearer.

## Verification

`localExtensions.ts:139–145` shows `remove` only unpersists when
`directoryOf(id)` resolves; `restore` (`147–157`) keeps failing directories in
`stored`. The test at `localExtensions.test.ts:190–214` pins the persisted
failure but covers no removal path. Panel rendering confirmed at
`ExtensionsPanel.tsx:67–81`.
