- name: Tab switching destroys CodeMirror editor state (cursor, scroll, undo history)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/TabContent.tsx
- lines: 131-145
- description: |
    `TabContent` renders `MarkdownEditor` with `key={tab.id}` (line 132). When the
    active tab changes, `tab.id` changes, so React unmounts the old `MarkdownEditor`
    and mounts a fresh one. The mount effect in `MarkdownEditor.tsx` (lines 57-87)
    creates a brand-new `EditorView` via `new EditorView(...)`, and the cleanup
    destroys the old one (`view.destroy()`).

    Consequence: every tab switch loses the per-tab CodeMirror state that a
    VS Code / Obsidian-style editor is expected to preserve:
      - Cursor position and selection
      - Scroll position
      - Undo/redo history
      - Folded ranges and viewport state

    The document *contents* survive because `DesktopShell` keeps them in a
    `documents: Record<string, DocumentViewState>` map keyed by tab id, but the
    editor's internal state is not preserved across the unmount/remount cycle.

    `editorTabId` in `tabModel.ts` (line 34) produces a stable id per
    `{rootPath, relativePath}` pair, so switching back to a previously-opened note
    still remounts the editor from scratch — the stable id does not help because
    the component is keyed on it and the key changes when the *active* tab
    changes.

    The fix requires separating the editor lifecycle from the active-tab
    lifecycle: either keep all open editors mounted (hidden via CSS) and switch
    visibility, or persist/restore CodeMirror `EditorState` per tab id and
    rehydrate it on remount (e.g. via a `StateField` snapshot or an external
    `EditorState` store).
- verification: |
    Read `TabContent.tsx` line 132 (`key={tab.id}`) and `MarkdownEditor.tsx`
    lines 57-87 (mount/destroy effect). Confirmed that `MarkdownEditor` is
    destroyed and recreated when the active tab id changes. Read `tabModel.ts`
    line 34 (`editorTabId`) to confirm ids are stable per file but the React
    `key` still changes when switching between different files.
