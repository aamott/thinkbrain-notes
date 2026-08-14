- name: Dead code in workspaceDocumentModel.ts — reducer and create function only used in tests
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/workspaceDocumentModel.ts
- lines: 13-57, 94-104
- description: The following exports in `workspaceDocumentModel.ts` have no production callers — they are only imported by `workspaceDocumentModel.test.ts`:

  - `WorkspaceDocumentPhase` (line 13) — type, only used in this file
  - `WorkspaceDocumentState` (lines 15-19) — interface, only used in this file + test
  - `WorkspaceDocumentAction` (lines 21-29) — type, only used in this file + test
  - `initialWorkspaceDocumentState` (lines 31-35) — only used in this file + test
  - `workspaceDocumentReducer` (lines 37-57) — only used in this file + test
  - `createWorkspaceDocument` (lines 94-104) — only used in test

  The production code (`DesktopShell.tsx`) imports only `loadWorkspaceDocument` and `saveWorkspaceDocument` from this file (confirmed via grep). The shell manages document view state with its own `DocumentViewState` type (in `shellTypes.ts`) and `useState`, not with this reducer. `createWorkspaceDocument` is never called in production — the explorer creates files via `workspaceAdapter.createWorkspaceFile`, and extensions call `workspaceDocumentApi.createMarkdownDocument` directly (not through this wrapper).

  This is also an over-abstraction: there are two parallel document state models — `DocumentViewState` in `shellTypes.ts` (used in production) and `WorkspaceDocumentState` here (used only in tests). The unused model adds maintenance burden without value.

  Estimated savings: ~50 lines (lines 13-57 reducer/state/action + lines 94-104 create function). The corresponding test cases in `workspaceDocumentModel.test.ts` would also be removed.

  Fix: remove the unused exports and their tests. If the reducer is intended for future use, note that in a comment instead of keeping dead code.

- verification: Grepped for `workspaceDocumentReducer|initialWorkspaceDocumentState|WorkspaceDocumentState|WorkspaceDocumentAction` across the whole repo — only matches in `workspaceDocumentModel.ts` and `workspaceDocumentModel.test.ts`. Grepped for `createWorkspaceDocument` — only matches in `workspaceDocumentModel.ts` and `workspaceDocumentModel.test.ts`. Grepped for `from ['"].*workspaceDocumentModel['"]` — only `DesktopShell.tsx` (imports `loadWorkspaceDocument, saveWorkspaceDocument`) and the test file.
