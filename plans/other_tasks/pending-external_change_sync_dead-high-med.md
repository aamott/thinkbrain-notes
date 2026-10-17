# Bug: External note changes do not reach the UI

Found while testing `workspace_session_owner` (merged with main through #50):

- Editing an open note externally does not reload the editor (clean tab) or
  warn (dirty tab).
- Externally renamed files do not update the explorer or retarget the tab.

## Investigation so far (verified, do not redo)

- Native watcher is confirmed **live** — the running process holds ~80
  inotify watches on the open vault (`/proc/<pid>/fdinfo`).
- The code path is identical to main end-to-end: `watch_workspace` →
  `workspace_session::watch` → `spawn_debouncer` → `app.emit("workspace://changed")`
  → `watchWorkspace` listener → `applyWorkspaceChanges` → `note.*` appEvents →
  `subscribeToNoteChanges` consumers (`useExternalDocumentSync`,
  explorer refresh, file list). All present and registered.
- Therefore most likely **pre-existing on main**, not a #52 regression — but
  that is not yet proven. First step is reproducing on `main`.

## Diagnostic shortcuts

- If `watchWorkspace`'s invoke fails, the webview console logs
  `[watcher] Edits made outside the app will not be picked up automatically.` —
  check devtools first.
- The emit only fires for `changes.notes` — non-Markdown edits are silently
  fed to sync only. Repro with a `.md` file, not other types.
- A quick isolation: create a `.md` externally — if it appears in the
  explorer, the event pipeline works and the bug is downstream
  (doc-sync/rename handling); if it does not, the native emit→renderer leg is
  dead.

## Suspects if it proves real

- `workspaceWatcher.ts` root-spelling vs canonical `rootPath` comparison.
- `subscribeToNoteChanges` `currentRootPath` getter returning a different
  spelling than events carry.
- `useWorkspaceIndexes` watch effect not re-running when the session root
  changes (deps: `restoredWorkspacePath`, `setWorkspaceFiles`).

## Native Recheck (2026-10-17)

Rechecked with an isolated native Tauri/WebKitGTK app at `9f66ba13`
(application code matches `d82658a3`), a temporary vault and separate app data.
Real filesystem edits reload a clean tab; creations refresh the explorer;
renames retarget the open tab and explorer. A dirty tab retains local edits
and shows the external-change warning; loading the disk version resolves it.
Opening through a symlink is canonicalized and still receives outside edits.

Not reproduced in this environment. Keep this report pending until the
original workspace/launch conditions can be reproduced; do not infer a fix
from passing unit tests or introduce a speculative change.
