# 007 — Movable Actions & Layout Slots

## Problem
Actions (Explorer, Search, Agent Chat, Settings, etc.) are hardcoded to specific
UI containers. Users should be able to drag any action button to any valid slot —
e.g. move Search from the left activity bar to the title bar, or into the status bar.

## Data Model

### Actions
Discrete, movable buttons. Each declares `id`, `icon`, `label`, and optional
`wide: true` (renders as a search-bar-style trigger instead of an icon).

```ts
interface ActionDef {
  id: string;          // 'files' | 'search' | 'chat' | 'settings' | ...
  icon: string;        // lucide icon name
  label: string;       // tooltip / aria-label
  wide?: boolean;      // render as wide trigger (command palette)
}
```

### Slots
Containers that hold an ordered list of actions. Each declares `id` and `orient`
(`'vertical' | 'horizontal'`) for drag-drop hit-testing and rendering.

```ts
interface SlotDef {
  id: string;          // 'activity-bar-top' | 'titlebar-left' | ...
  orient: 'vertical' | 'horizontal';
}
```

### Layout Config
A map of `slotId → ActionId[]` (ordered). This is the persisted user preference.

```ts
type LayoutConfig = Record<string, string[]>;
```

## Slots

| Slot ID              | Location                                  | Orient   |
|----------------------|-------------------------------------------|----------|
| `activity-bar-top`   | Far-left strip, top group                 | vertical |
| `activity-bar-bottom`| Far-left strip, bottom group (above cmd)  | vertical |
| `titlebar-left`      | Title bar, right of command-palette search| horizontal |
| `titlebar-right`     | Title bar, left of window controls        | horizontal |
| `statusbar-left`     | Bottom status bar, left group             | horizontal |
| `statusbar-right`    | Bottom status bar, right group            | horizontal |

The command-palette search bar is a **fixed** title-bar anchor (not movable) —
the two title-bar zones are defined relative to it.

## Default Layout

```
activity-bar-top:    [files, search, chat]
activity-bar-bottom: [settings]
titlebar-left:       []
titlebar-right:      []
statusbar-left:      []
statusbar-right:     []
```

## Persistence
- **Mockup**: `localStorage` key `action-layout`.
- **Production**: app config in OS `AppData` (never in the vault — AGENTS.md Rule 1).
  Zustand store hydrated from Tauri settings on startup, debounced write on change.

## Drag-and-Drop UX

**Edit mode gates all DnD.** Buttons are only `draggable` while layout
editing is active — normal clicks never trigger accidental drags.

1. **Enter edit mode**: via the command palette ("Edit Action Layout") or
   a future dedicated toggle. A banner appears below the title bar:
   "Editing layout — drag action buttons to rearrange them. [Done]"
   `body.edit-layout` class is set on the body for CSS styling.
2. **Visual cues in edit mode**: all slots show dashed outlines (including
   empty ones) so the user can see valid drop targets. Action buttons get
   a `grab` cursor.
3. **Drag**: action buttons are `draggable`. On `dragstart`, store the
   source slot + action id. Add a `dragging` class (dimmed, opacity 0.4).
4. **Dragover**: slots are drop targets. On `dragover`, `preventDefault()`
   to allow drop. Add a `drag-over` class (blue highlight).
5. **Drop**: move the action from source slot to target slot (remove from
   source, insert at end of target). Re-render all slots. Save layout.
6. **Reorder within a slot**: drop position is appended at end. (Insertion-
   point indicators are a future enhancement; v1 appends.)
7. **Exit edit mode**: click "Done" in the banner, press Esc, or toggle
   via the command palette again. Buttons become non-draggable; slot
   outlines disappear.
8. **Reset**: a `resetLayout` command in the command palette restores
   defaults (works in or out of edit mode).

## Action Click Behavior
Each action id maps to a handler via an `ACTION_HANDLERS` map:
```ts
const ACTION_HANDLERS: Record<string, () => void> = {
  files:    () => switchLeftPanel('files'),
  search:   () => switchLeftPanel('search'),
  chat:     () => toggleRightChat(),
  settings: () => openSettings(),
};
```

## Active State
The active indicator (blue bar / color) is tracked by action id, not by
hardcoded element ids. `setActiveAct(actionId)` toggles the `active` class
on whichever button currently renders that action, regardless of which slot
it's in. This requires re-applying active state after every slot re-render.

## Production Notes (React)
- **State**: Zustand `layoutStore` with `layout`, `moveAction`, `resetLayout`.
- **DnD**: `@dnd-kit/core` with `Droppable` slots and `Draggable` action buttons.
  Supports keyboard + screen-reader accessibility out of the box.
- **Rendering**: each slot component reads its action list from the store and
  maps to `<ActionButton>` components. Action buttons are slot-agnostic — they
  render as an icon (vertical slot) or icon+label (horizontal slot).
- **Extensions**: extension-registered actions add entries to the action
  registry; the layout config references them by id. Unknown ids in a saved
  layout (uninstalled extension) are silently filtered on load.
