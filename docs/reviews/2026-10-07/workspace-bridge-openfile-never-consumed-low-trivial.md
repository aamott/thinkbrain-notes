# `WorkspaceBridge.openFile` is published but never consumed

- **Urgency:** low
- **Difficulty:** trivial
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/workspaceBridge.ts`
- **Lines:** 20–21

## Description

`WorkspaceBridge` declares an optional `openFile` member ("Opens any
workspace-relative file, inferring the tab kind from extension"), and
`useWorkspaceLifecycle.ts` (lines 213–218) does the work of wiring it to
`openFileDocument` on every bridge publish. But nothing ever reads it: a
repo-wide grep for `.openFile` finds only the declaration. The
extension-facing workspace API (`DesktopExtensionWorkspace`) exposes only
`openNote`, and `desktopExtensionHost.ts` consumes only `bridge.openTab`.

The field is either leftover from an earlier design or scaffolding for an
`openFile` extension API that was never added. Either way it costs a
conditional wrapper in the shell on every republish.

## Recommendation

Either delete `openFile` from `WorkspaceBridge` and drop the corresponding
closure in `useWorkspaceLifecycle.ts`, or — if an extension `openFile` API is
planned — add the consumer (`DesktopExtensionWorkspace.openFile` delegating to
`bridge.openFile` with an `assertRelativePath` check) and remove the
`?` optionality.

## Verification

`rg '\.openFile\b|openFile\?'` across the repo returns only the declaration in
`workspaceBridge.ts:21`. Publisher read at
`shell/useWorkspaceLifecycle.ts:213–218`; consumers checked at
`extensions/desktopExtensionHost.ts:368–370` (`openTab`) and
`extensions/extensionWorkspace.ts:120–123` (`openNote` only).
