- name: applyEdit from header contributions causes full document replacement and cursor loss
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/MarkdownEditor.tsx
- lines: 89-93, 133-135
- description: |
    `MarkdownEditor` wires `EditorHeaderSlot`'s `applyEdit` to `onChange` (line
    134). `onChange` flows up to `DesktopShell.updateDocument` (line 425-431),
    which stores the new contents in React state. That state flows back as the
    `value` prop, triggering the `value` effect (lines 89-93):

    ```ts
    useEffect(() => {
      const view = viewRef.current;
      if (!view || value === view.state.doc.toString()) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }, [value]);
    ```

    This dispatches a **full document replacement** (`from: 0, to:
    view.state.doc.length`). CodeMirror cannot preserve the cursor across a
    full-range replacement, so the selection jumps.

    This is not theoretical: the built-in journal extension's
    `MetadataWidgetContainer` (journal/MetadataWidgetContainer.tsx line 111)
    calls `applyEdit(setFrontmatterField(contents, fieldId, value))` whenever a
    user edits a frontmatter field via the metadata widget. If the user's
    cursor is in the document body when they tap a metadata pill, the cursor
    jumps to the end of the document. The replacement also creates a single
    undo step, so the user must undo twice to revert the metadata edit.

    The `EditorHeaderContext` docstring (editorHeaderRegistry.tsx lines 25-30)
    says "Edits go through the editor, not the file," but the implementation
    routes through React state and a full replacement rather than dispatching
    a targeted `changes` transaction to the CodeMirror view.

    The fix is to give header contributions access to the `EditorView` (or a
    dispatch callback) so they can issue targeted edits, or to have
    `applyEdit` dispatch through a CodeMirror facet/extension that computes a
    minimal diff rather than a full replacement.
- verification: |
    Read `MarkdownEditor.tsx` lines 89-93 (value effect) and line 134
    (applyEdit wiring). Read `MetadataWidgetContainer.tsx` line 111 to confirm
    `applyEdit` is called by the built-in journal extension.
    Read `editorHeaderRegistry.tsx` lines 25-30 for the contract docstring.
    Read `frontmatterEdit.ts` to confirm `setFrontmatterField` returns full
    contents.
