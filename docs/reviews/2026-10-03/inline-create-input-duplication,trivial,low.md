- name: InlineNameInput is rendered twice with ~15 identical prop mappings
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/WorkspaceExplorerView.tsx
- lines: 207-224; WorkspaceTree.tsx 195-210
- description: |
  The root-level create input and the in-folder create input repeat the same
  prop derivation: isNewNoteCreate twice for initialValue/caretBeforeExtension/
  error, kind-based icon/placeholder/ariaLabel, focusRequest key, submit/cancel
  wiring. A small `CreateNameInput({ creating, depth, busy?, actions })` wrapper
  would own that mapping once; the tree keeps only the depth + parentPath
  difference.
- verification: Compared both JSX blocks — every prop except depth and the
  wrapping <ul>/<li> is derived from `creating` by the same expressions.
