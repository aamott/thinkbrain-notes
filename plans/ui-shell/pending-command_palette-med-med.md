# Command Palette

**Goal:** Build a command palette overlay toggled by the title bar search
anchor or `⌘K` / `Ctrl+K`. Include "Edit Action Layout" and "Reset Action
Layout" commands. Fuzzy-filter commands by label and category.

**Acceptance criteria:**
- Command palette overlay: fixed, centered, with search input and filtered result list
- Toggled by clicking title bar search anchor or pressing `⌘K` / `Ctrl+K`
- Closes on Esc, selection, or backdrop click
- Command registry with id, icon, label, hint/category, optional keyboard shortcut
- Commands include: "Edit Action Layout", "Reset Action Layout", "Open Settings", plus existing app commands
- "Edit Action Layout" toggles edit mode; "Reset Action Layout" calls `resetLayout()`
- Filtered results update as user types; first result is pre-selected
- Keyboard navigation: arrow keys to move selection, Enter to execute
- CSS Modules for styling (no inline styles)

**File references:**
- New: `apps/desktop/src/layout/CommandPalette.tsx` + `.module.css`
- New: `apps/desktop/src/layout/commandRegistry.ts`
- Modify: `apps/desktop/src/App.tsx` (wire ⌘K handler, mount palette)
- Design source: `plans/archive/old-structure/007-movable-actions.md` (Command Palette integration)
- Mockup reference: `mockup2.htm` (openCommandPalette, renderCommandPalette, executeCommand, mockCommands)
