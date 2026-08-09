- name: MetadataWidgetContainer silently drops edits when applyEdit is absent
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/MetadataWidgetContainer.tsx
- lines: 111
- description: |
    `MetadataWidgetContainer` accepts an optional `applyEdit` and forwards edits
    through it:
    ```ts
    onSet={(fieldId, value) => applyEdit?.(setFrontmatterField(contents, fieldId, value))}
    ```
    When `applyEdit` is `undefined`, `onSet` becomes a no-op: the user can tap
    pills, type into inputs, and add fields, but nothing is written and no
    feedback is given. The `MetadataWidget` and `MetadataField` components
    render fully interactive controls regardless of whether a write path
    exists, so the failure is silent.

    `applyEdit` comes from `EditorHeaderContext` (`editorHeaderRegistry.tsx`
    line 30), where it is typed `applyEdit?: (contents: string) => void`. The
    current sole host, `MarkdownEditor.tsx` line 134, always passes
    `applyEdit: onChange`, so the bug is latent today. But the type contract
    explicitly allows the field to be absent (e.g., a read-only preview host),
    and the container does not guard against it. Per "fail loudly", the
    container should either render the widget in a read-only mode when
    `applyEdit` is missing, or log a warning when an `onSet` is invoked with no
    write path. At minimum, `MetadataWidget` should receive a `readOnly` flag
    derived from `applyEdit === undefined` and disable the editable controls.
- verification: |
    Read `MetadataWidgetContainer.tsx` line 111 (`applyEdit?.(...)` no-op when
    absent). Read `editorHeaderRegistry.tsx` line 30 (`applyEdit?:` optional on
    `EditorHeaderContext`). Read `MarkdownEditor.tsx` line 134 (current host
    always passes `onChange`). Read `MetadataWidget.tsx` lines 78-86 and
    `MetadataField.tsx` lines 34-56 — no `readOnly`/`disabled` prop; controls
    are always interactive.
