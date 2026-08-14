- name: Duplicated context menu logic between shell/ContextMenu.tsx and workspace/WorkspaceExplorer.tsx
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/ContextMenu.tsx
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/WorkspaceExplorer.tsx
- lines: ContextMenu.tsx 23-55, 62-117, 123-145; WorkspaceExplorer.tsx 934-964, 976-1059
- description: Three pieces of context-menu logic are duplicated verbatim between `shell/ContextMenu.tsx` and `workspace/WorkspaceExplorer.tsx`:

  1. **`handleMenuKeyDown`** — keyboard navigation for `role="menu"` containers (ArrowUp/Down with wrap, Home/End, Escape). Identical implementation in ContextMenu.tsx (lines 23-55) and WorkspaceExplorer.tsx (lines 934-964). The WorkspaceExplorer version is used by both `WorkspaceContextMenu` (line 1014) and `WorkspaceSelector` (line 1180).

  2. **`MenuButton`** — a `role="menuitem"` button with optional `danger` styling. Identical implementation in ContextMenu.tsx (lines 123-145) and WorkspaceExplorer.tsx (lines 1041-1059).

  3. **Context menu positioning `useEffect`** — clamps menu position to viewport with 8px margin. Identical logic in ContextMenu.tsx (lines 75-82) and WorkspaceExplorer.tsx (lines 989-996):
     ```ts
     const rect = element.getBoundingClientRect();
     const x = Math.min(state.x, window.innerWidth - rect.width - 8);
     const y = Math.min(state.y, window.innerHeight - rect.height - 8);
     setPosition({ x: Math.max(8, x), y: Math.max(8, y) });
     ```

  `shell/ContextMenu.tsx` already exports a generic `ContextMenu` wrapper (positioning + keyboard nav + outside-click close) and `MenuButton`. `JournalPanel.tsx` already imports and uses both from `shell/ContextMenu.tsx` (confirmed via grep). `WorkspaceExplorer.tsx` should do the same: replace `WorkspaceContextMenu` with a usage of the shared `ContextMenu` component, passing workspace-specific menu items as children using the shared `MenuButton`.

  After refactoring `WorkspaceContextMenu` to use the shared `ContextMenu`, the local `handleMenuKeyDown` in WorkspaceExplorer would only be used by `WorkspaceSelector` (1 remaining caller). At that point, `handleMenuKeyDown` should be extracted from `ContextMenu.tsx` to a shared utility (e.g. `shell/menuKeyboard.ts`) so `WorkspaceSelector` can import it without importing the `ContextMenu` component.

  Estimated savings: ~60-70 lines in WorkspaceExplorer.tsx (eliminate `handleMenuKeyDown` ~30 lines, `MenuButton` ~18 lines, `WorkspaceContextMenu` positioning effect and boilerplate ~15 lines). The shared `ContextMenu` and `MenuButton` in `shell/ContextMenu.tsx` stay as-is.

- verification: Grepped for `handleMenuKeyDown` — found in 2 files (ContextMenu.tsx, WorkspaceExplorer.tsx). Grepped for `function MenuButton` — found in the same 2 files. Grepped for `getBoundingClientRect` in context-menu positioning — found identical logic in both. Confirmed `JournalPanel.tsx` imports `ContextMenu, MenuButton, type ContextMenuState` from `shell/ContextMenu.tsx`, demonstrating the intended reuse pattern.
