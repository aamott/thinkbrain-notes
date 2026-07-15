# Drag-and-Drop with Edit-Mode Gating

**Goal:** Implement drag-and-drop for action buttons between slots using
`@dnd-kit/core`, gated by an edit mode so normal clicks never trigger
accidental drags. Include the edit-mode banner and visual cues.

**Acceptance criteria:**
- `@dnd-kit/core` added as a dependency
- Edit mode toggled via command palette ("Edit Action Layout") or future dedicated toggle
- Edit-mode banner below title bar: "Editing layout — drag action buttons to rearrange them. [Done]"
- `body.edit-layout` class set on body for CSS styling during edit mode
- In edit mode: all slots show dashed outlines (including empty ones); action buttons get `grab` cursor
- Action buttons are `Draggable` only while edit mode is active
- Slots are `Droppable`; drop moves action from source to target (append at end)
- `dragging` class on source button (dimmed, opacity 0.4); `drag-over` highlight on hover target
- Exit edit mode: "Done" button, Esc key, or command palette toggle
- DnD is keyboard + screen-reader accessible (provided by @dnd-kit/core)
- CSS Modules for all styling (no inline styles)

**File references:**
- New: `apps/desktop/src/layout/EditModeBanner.tsx` + `.module.css`
- New: `apps/desktop/src/layout/useLayoutDnd.ts` (DnD wiring hook)
- Modify: `apps/desktop/src/layout/ActionButton.tsx` (Draggable wrapper)
- Modify: `apps/desktop/src/layout/ActionSlot.tsx` (Droppable wrapper)
- Modify: `apps/desktop/src/stores/layoutStore.ts` (edit mode state, moveAction on drop)
- Mockup reference: `mockup2.htm` (toggleEditMode, wireSlotDropTargets, drag events)
