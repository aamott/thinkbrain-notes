- name: DragSession is initialized by three copy-pasted object literals
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/useWorkspaceTreeDrag.ts
- lines: 412-437, 494-519, 662-687
- description: |
  The pointer, touch, and keyboard entry points each build the same ~25-field
  DragSession literal, differing only in phase, inputKind, pointerType,
  pointerId, start coordinates, and pointerTarget. A `createSession(entry,
  overrides)` factory removes ~60 duplicated lines and makes adding a session
  field a one-line change instead of three. While there: the escape-key
  keyListener is wired identically in pointer and touch paths.
- verification: Read the three literals; fields 413-436, 495-518, 663-686 are
  identical except the values listed above.
