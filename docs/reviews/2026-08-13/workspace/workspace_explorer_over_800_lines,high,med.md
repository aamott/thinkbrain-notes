- name: WorkspaceExplorer.tsx exceeds 800-line hard limit
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/WorkspaceExplorer.tsx
- lines: 1-1276
- description: WorkspaceExplorer.tsx is 1276 lines, the largest file in the workspace area and well over the 800-line hard limit. It contains the main `WorkspaceExplorer` component (lines 41-629), `WorkspaceTreeItem` (lines 633-823), `InlineNameInput` (lines 836-923), `WorkspaceContextMenu` (lines 976-1039), `MenuButton` (lines 1041-1059), `DeleteConfirmDialog` (lines 1063-1116), `EmptyState`/`StatusState`/`ErrorState` (lines 1120-1141), `WorkspaceSelector` (lines 1143-1230), and helper functions (lines 1232-1264).

  Candidate extraction boundaries (each is independently coherent):
  1. **`WorkspaceTreeItem`** (lines 633-823): self-contained recursive tree node component — extract to its own file.
  2. **`InlineNameInput`** (lines 836-923): self-contained inline rename/create input — extract to its own file.
  3. **`WorkspaceContextMenu` + `MenuButton` + `handleMenuKeyDown`** (lines 934-1059): context menu and shared keyboard nav — extract or consolidate with `shell/ContextMenu.tsx` (see cross-file finding on duplicated context menu logic).
  4. **`DeleteConfirmDialog`** (lines 1063-1116): self-contained confirmation modal — extract to its own file.
  5. **`WorkspaceSelector`** (lines 1143-1230): workspace switcher dropdown — extract to its own file.
  6. **State helpers** (`joinPath`, `isMarkdownName`, `isValidName`, `isValidFolderPath`, `RenameState`, `CreateState`) — extract to a model file.

- verification: Read the full file (1276 lines). AGENTS.md states "Never over 800 lines."
