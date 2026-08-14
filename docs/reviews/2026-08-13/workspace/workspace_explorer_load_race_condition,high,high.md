- name: Race condition in WorkspaceExplorer.loadWorkspace — stale completion overwrites current workspace
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/WorkspaceExplorer.tsx
- lines: 112-141
- description: `loadWorkspace` sets `rootPathRef.current = rootPath` synchronously, then performs async work (read settings, open workspace, list entries). If `loadWorkspace("A")` starts and `loadWorkspace("B")` starts before A's awaits complete, A's completion dispatches `opened` with A's snapshot — but `rootPathRef.current` is now "B". This overwrites B's state with A's data.

  The bug: `loadWorkspace` does NOT guard against the root changing mid-flight. Compare with `refreshEntries` (line 150: `if (rootPathRef.current !== rootPath) return;`) and `runWithRefresh` (lines 262, 264: `if (rootPathRef.current !== rootPath) return true;`), which both check after each `await`. `loadWorkspace` has no such guard before its `dispatch({ type: "opened", snapshot, entries })` at line 135 or before `onWorkspaceOpened?.(rootPath, snapshot)` at line 136.

  Fix: capture `rootPath` in a local, and after each `await`, check `if (rootPathRef.current !== rootPath) return;` before dispatching `opened` and calling `onWorkspaceOpened`.

  Trigger: the `useEffect` at line 197 depends on `[initialWorkspacePath, loadWorkspace]`. If `initialWorkspacePath` changes rapidly (user switches workspace quickly), or if `loadWorkspace`'s identity changes because `onWorkspaceOpened`/`onWorkspaceUnavailable` were not memoized by a parent, the effect re-runs and two loads overlap.

- verification: Read `loadWorkspace` (lines 112-141), `refreshEntries` (lines 143-155), and `runWithRefresh` (lines 252-277). Confirmed that `loadWorkspace` lacks the `rootPathRef.current !== rootPath` guard that the other two async helpers have.
