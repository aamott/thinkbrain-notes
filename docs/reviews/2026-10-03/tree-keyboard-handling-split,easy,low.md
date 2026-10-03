- name: Tree keyboard navigation is split across two files
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/WorkspaceExplorer.tsx
- lines: 592-619; WorkspaceTree.tsx 73-109
- description: |
  ArrowUp/ArrowDown/Home/End are handled in the explorer's handleTreeKeyDown
  on the <ul>, while ArrowLeft/ArrowRight/Enter/Space are handled per-row in
  WorkspaceTreeItem.handleKeyDown — each half needs the other's mental model
  (visiblePaths ordering, roving tabindex) to modify safely. Consolidate into
  one place: either a single keydown handler on the list that resolves the
  row via its data attribute, or a useTreeKeyboard hook owning all keys, so the
  tree's keyboard contract lives in one file.
- verification: Read both handlers; ArrowRight needs node.children (row) while
  ArrowDown needs visiblePaths (list) — the split exists only because each
  handler grabbed the data nearest to it.
