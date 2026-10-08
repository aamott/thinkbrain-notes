# `openNote` silently no-ops with no workspace while siblings throw

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/extensionWorkspace.ts`
- **Lines:** 88–95, 120–123

## Description

`readNote`, `writeNote`, `createNote`, `renameNote`, `deleteNote`, and
`listNotes` all funnel through `resolve`/the `root` check and throw
`"No workspace is open."` when `bridge.rootPath` is `null`.

`openNote` instead calls `bridge().openNote(relativePath)`, and the bridge's
own closure (`useWorkspaceLifecycle.ts:209–212`) early-returns when
`restoredWorkspacePath` is null. Net effect: with no workspace open, an
extension calling `openNote` gets a silent no-op while an extension calling
`readNote` gets a clear error. `journalService.create` relies on this
ordering (`createNote` throws before `openNote` is reached), but a direct
extension call gives no feedback.

Related nit: `resolve()` reads `getBridge()?.rootPath` inline rather than via
the `bridge()` helper, so "shell not mounted" and "no workspace open" collapse
into the same message for reads/writes but not for `openNote`/`tabs.open`
(which throw "not ready"). Two different error vocabularies for the same
condition.

## Recommendation

In `openNote`, resolve the bridge first and throw `"No workspace is open."`
when `bridge().rootPath` is null, matching the other methods. Optionally use
the `bridge()` helper inside `resolve()` so "not ready" and "no workspace"
stay distinguishable everywhere.

## Verification

`extensionWorkspace.ts:120–123` calls `bridge().openNote` with no root check;
`shell/useWorkspaceLifecycle.ts:209–212` no-ops on null
`restoredWorkspacePath`. The throwing path for siblings is at
`extensionWorkspace.ts:88–95` and `136–138`. Test coverage
(`extensionWorkspace.test.ts:103–119`) asserts the throw for reads but has no
no-workspace case for `openNote`.
