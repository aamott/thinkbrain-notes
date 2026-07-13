# Slot and Action Button Components

**Goal:** Build slot components that read their action list from the
`layoutStore` and render `ActionButton` components. Restructure the title bar
and activity bar to host the six layout slots. Action buttons are
slot-agnostic — icon-only in vertical slots, icon+label in horizontal slots.

**Acceptance criteria:**
- `ActionButton` component: renders lucide icon (vertical) or icon+label (horizontal) based on slot orientation
- `ActionSlot` component: reads action list from `layoutStore`, maps to `ActionButton`s
- Activity bar split into `activity-bar-top` and `activity-bar-bottom` slots with a flex spacer between
- Title bar restructured: app identity (left), command-palette search anchor (center, fixed placeholder), `titlebar-left` slot, `titlebar-right` slot, window controls (right)
- Status bar hosts `statusbar-left` and `statusbar-right` slots
- Action click dispatches to `ACTION_HANDLERS` map (files→switchLeftPanel, search→switchLeftPanel, chat→toggleRightChat, command→openCommandPalette, settings→openSettings)
- `lucide-react` added as a dependency
- CSS Modules co-located with components (no inline styles, no Tailwind)
- Existing sidebar panels (WorkspaceExplorer, SearchPanel, SettingsPanel) still render correctly

**File references:**
- New: `apps/desktop/src/layout/ActionButton.tsx` + `.module.css`
- New: `apps/desktop/src/layout/ActionSlot.tsx` + `.module.css`
- Modify: `apps/desktop/src/App.tsx` (title bar, activity bar, status bar restructure)
- Modify: `apps/desktop/src/styles.css` (grid layout adjustments)
- Existing: `apps/desktop/src/stores/appStore.ts` (ActivePanel, setActivePanel)
- Mockup reference: `mockup2.htm` (renderActionButton, renderSlot, layout structure)
