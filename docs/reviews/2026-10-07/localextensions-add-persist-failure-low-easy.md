# `add` rejects with a raw store error after the extension already loaded

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/localExtensions.ts`
- **Lines:** 106–123

## Description

In `add`, after `load(directory)` succeeds and the extension is fully
registered, `await persist([...stored, directory])` runs inside the same
await chain. If the directory store write fails (native desktop-state write
error), `add` rejects with the raw error even though the extension *is*
loaded and working for the session. The Extensions panel `run` wrapper shows
the raw message as the load result, and a retry immediately hits
`directory_already_loaded` — so the user sees a failure and can never
"re-add" to fix persistence without a restart.

Same shape in `remove`: a failed `persist` rejects after the extension is
already unloaded.

## Recommendation

Isolate persistence from the load outcome: catch the `persist` failure,
`console.error` it (consistent with `main.tsx:27–29` and
`bootstrap.ts:136`), and still return the load outcome — optionally with an
extra `severity: "warning"` diagnostic noting the directory will not survive
a restart. (Note the panel currently renders only `error` diagnostics, so a
warning would need a panel tweak to be visible.)

## Verification

`localExtensions.ts:115–122` — `persist` awaited unconditionally after a
successful `load`; nothing catches it. `ExtensionDirectoryStore.save` is
`Promise<void>` with no documented never-throw contract, and the desktop
implementation goes through `saveDesktopState` → IPC
(`desktopExtensionDirectoryStore.ts:18–20`).
