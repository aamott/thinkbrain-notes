# Sidebar Minimize Toggle

**Goal:** Implement VS Code-style sidebar collapse/expand. Clicking the
active activity bar action toggles the sidebar between visible and collapsed.
A collapsed sidebar frees the editor area.

**Acceptance criteria:**
- `sidebarCollapsed: boolean` state in `appStore` (or `layoutStore`)
- Clicking the currently-active activity bar action toggles collapse (VS Code behavior)
- Clicking a different action expands the sidebar and switches panels
- Collapsed sidebar hides the sidebar panel; editor area expands to fill
- CSS grid template adjusts when sidebar is collapsed (activity bar remains visible)
- Toggle command available in command palette ("Toggle Sidebar", `⌘B`)
- Unit test for toggle state and panel-switching behavior

**Note:** Git log commit `27bf273` claims "implement sidebar minimize toggle
matching VS Code behavior" but no collapse/minimize state exists in
`appStore.ts` or any component. This story implements it for real —
investigate whether the commit was reverted or only partially applied.

**File references:**
- Modify: `apps/desktop/src/stores/appStore.ts` (sidebarCollapsed, toggleSidebar)
- Modify: `apps/desktop/src/App.tsx` (collapse logic, grid area adjustment)
- Modify: `apps/desktop/src/styles.css` (collapsed sidebar grid template)
- Mockup reference: `mockup2.htm` (cmd.toggle-sidebar, panel show/hide logic)
