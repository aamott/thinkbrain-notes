- name: Header save path is split between the commands registry and tab-kind prop plumbing
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/WorkspaceHeaderBar.tsx
- lines: 96-144
- description: |
  The new registry was meant to avoid "threading the CodeMirror view through
  three layers of props", but Save only half-moved: merge tabs register
  `save`/`canSave`/`saveLabel`, while editor and code-editor tabs still drive
  the button through the `isDirty`/`isSaving`/`onSave` props and a hardcoded
  `activeTab?.kind === "editor" || "code-editor"` check (line 120). Consequences:

  - The header must know which tab kinds are saveable — the same knowledge
    TabContent and desktopTabRegistry already encode. A new saveable tab kind
    has to touch three places.
  - `canUndo`/`canRedo`/`canSave` are *called during render* (lines 100, 110,
    123) reading live CodeMirror state through the registry, while dirty state
    for the same button arrives via props — two different staleness models
    feeding one button row.
  - The `commands?.save ?? onSave` fallback (line 129) means the button's
    behaviour silently changes depending on whether the tab registered yet
    (e.g. during the mount frame of a merge tab).

  Direction: let editor/code-editor surfaces register `save`/`canSave` too
  (MarkdownEditor already calls `onSaveRef.current()` and can read
  `view.state`; `isDirty` could be exposed via `canSave`), so the header
  renders the row purely from `useEditorCommands(activeTab?.id)` and the
  `isDirty`/`onSave` props, plus the kind check, can be dropped. Alternatively,
  if props stay, push the per-kind visibility decision into the tab registry
  (e.g. `view.isSaveable`) instead of a literal kind list.
- verification: |
  Read WorkspaceHeaderBar.tsx, editorCommands.ts, and the registration call
  sites in MarkdownEditor.tsx (169-181), CodeEditor.tsx (122-134) and
  MergeTab.tsx (212-238): only MergeTab registers a `save`, while the header
  special-cases `editor`/`code-editor` kinds and falls back to the `onSave`
  prop.
