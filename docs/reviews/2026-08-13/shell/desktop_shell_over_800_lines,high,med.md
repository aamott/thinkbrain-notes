- name: DesktopShell.tsx exceeds 800-line hard limit
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/DesktopShell.tsx
- lines: 1-1106
- description: DesktopShell.tsx is 1106 lines, well over the 800-line hard limit set in AGENTS.md ("Never over 800 lines. Break up earlier rather than later when it is already big."). The file is a single component with ~30 useState/useRef hooks, ~15 useEffect hooks, ~15 useCallback hooks, and ~10 inline handlers. It handles: state restoration, tab persistence, panel resizing, workspace watching, note-change subscription, document sync, save/conflict resolution, command palette dispatch, and keyboard shortcuts — all in one component.

  Candidate extraction boundaries (each is independently coherent):
  1. **Document sync logic** (lines 190-830): `loadDocumentIntoView`, `reloadDocumentInPlace`, `saveDocument`, `keepMyVersion`, `loadDiskVersion`, `updateDocument` — these form a self-contained "open document manager" that could be a custom hook (e.g. `useOpenDocuments`) returning `{documents, conflicts, saveDocument, keepMyVersion, loadDiskVersion, updateDocument, loadDocumentIntoView}`.
  2. **Workspace lifecycle effects** (lines 478-680): the workspace bridge, settings reload, search/wiki indexing, watcher, and note-change subscriptions — could be a `useWorkspaceLifecycle` hook.
  3. **Panel resize logic** (lines 358-927): `updatePanelWidth`, `resetPanelWidth`, `beginResize`, `resizeWithKeyboard`, `savePanelWidth` — could be a `usePanelResize` hook.
  4. **Desktop state persistence** (lines 309-393): `persistDesktopState`, `saveTabs`, `savePanelWidth` — could be a `useDesktopStatePersistence` hook.

- verification: Read the full file (1106 lines). AGENTS.md states "Never over 800 lines." The file is the largest in the shell area by a wide margin.
