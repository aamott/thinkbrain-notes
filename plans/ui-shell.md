# UI Shell

> The desktop layout system (VS Code/Obsidian-inspired). The basic shell exists;
> this epic covers the remaining work — primarily movable actions, layout slots,
> and the command palette. Read `plans/app-vision.md` first for app context.

## Goal

Make the desktop shell's action buttons user-movable between defined layout
slots (activity bar, title bar, status bar), with persisted layout config, a
command palette, and VS Code-style sidebar collapse — without hardcoding
actions to specific containers.

## Scope

**In scope:**
- Movable actions and layout slots (from old `007-movable-actions.md` design)
- Layout config persistence (Zustand store → OS AppData via Tauri)
- Drag-and-drop with edit-mode gating (`@dnd-kit/core`)
- Active state tracking by action id (not by hardcoded element)
- Command palette with "Edit Action Layout" and "Reset Action Layout" commands
- Sidebar minimize toggle (VS Code-style collapse/expand)

**Out of scope:**
- Extension-registered actions (deferred to `extensions` epic)
- AI panel / ACP chat (deferred to `ai` epic)
- Insertion-point indicators for intra-slot reordering (v1 appends at end)
- Mobile layout (deferred to `mobile` epic)

## Architecture

### Action and Slot Model

Actions are discrete, movable buttons. Each declares `id`, `icon`, `label`,
and optional `wide` (renders as a wide trigger instead of an icon).

```ts
interface ActionDef {
  id: string;          // 'files' | 'search' | 'chat' | 'settings' | ...
  icon: string;        // lucide icon name
  label: string;       // tooltip / aria-label
  wide?: boolean;      // render as wide trigger (command palette)
}
```

Slots are containers holding an ordered list of actions. Each declares `id`
and `orient` (`'vertical' | 'horizontal'`) for drag-drop hit-testing and
rendering.

```ts
interface SlotDef {
  id: string;          // 'activity-bar-top' | 'titlebar-left' | ...
  orient: 'vertical' | 'horizontal';
}
```

Layout config is a map of `slotId → ActionId[]` (ordered). This is the
persisted user preference.

```ts
type LayoutConfig = Record<string, string[]>;
```

### Slots

| Slot ID               | Location                                   | Orient    |
|-----------------------|--------------------------------------------|-----------|
| `activity-bar-top`    | Far-left strip, top group                  | vertical  |
| `activity-bar-bottom` | Far-left strip, bottom group (above cmd)   | vertical  |
| `titlebar-left`       | Title bar, right of command-palette search | horizontal|
| `titlebar-right`      | Title bar, left of window controls         | horizontal|
| `statusbar-left`      | Bottom status bar, left group              | horizontal|
| `statusbar-right`     | Bottom status bar, right group             | horizontal|

The command-palette search bar is a **fixed** title-bar anchor (not movable).
The two title-bar zones are defined relative to it.

### Default Layout

```
activity-bar-top:    [files, search, chat]
activity-bar-bottom: [command, settings]
titlebar-left:       []
titlebar-right:      []
statusbar-left:      []
statusbar-right:     []
```

### Persistence

Layout config persists to OS `AppData` (never in the vault — AGENTS.md rule).
A Zustand `layoutStore` is hydrated from Tauri settings on startup, with
debounced writes on change. Unknown action ids in a saved layout (e.g.
uninstalled extension actions) are silently filtered on load.

### Drag-and-Drop

**Edit mode gates all DnD.** Buttons are only draggable while layout editing
is active — normal clicks never trigger accidental drags. Edit mode is entered
via the command palette ("Edit Action Layout") and exited via the banner "Done"
button or Esc.

- DnD library: `@dnd-kit/core` (keyboard + screen-reader accessible).
- Slots are `Droppable`; action buttons are `Draggable`.
- Drop position appends to end of target slot (v1; insertion indicators are
  future work).
- Visual cues: dashed slot outlines (including empty slots) and `grab` cursor
  in edit mode; `drag-over` highlight on hover; `dragging` class (dimmed) on
  the source button.

### Active State

The active indicator (blue bar / color) is tracked by action id, not by
hardcoded element ids. `setActiveAct(actionId)` toggles the `active` class on
whichever button currently renders that action, regardless of which slot it's
in. Active state is re-applied after every slot re-render.

### Command Palette

A fixed overlay toggled by the title bar search or `⌘K` / `Ctrl+K`. Built
from a registered command list. Includes "Edit Action Layout" and "Reset
Action Layout" commands. Closes on Esc or selection.

### Styling Note

The mockup (`mockup2.htm`) uses Tailwind CSS v4 and CDN lucide. Production
uses CSS Modules (`*.module.css`) co-located with components and `lucide-react`
as an npm dependency — per AGENTS.md styling rules. The mockup is reference
only, not a dependency.

## Status

- ✅ basic shell layout (title bar, activity bar, sidebar, editor, right panel, status bar) — `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`
- ✅ active panel switching (explorer/search/settings) — `apps/desktop/src/stores/appStore.ts:ActivePanel`, `App.tsx:ActiveSidePanel`
- ✅ left sidebar panels (WorkspaceExplorer, SearchPanel, SettingsPanel) — `apps/desktop/src/workspace/`, `apps/desktop/src/search/`, `apps/desktop/src/settings/`
- ✅ right panel placeholder (deferred for AI/ACP) — `App.tsx:115`
- ⬜ action and slot registry (ActionDef, SlotDef, default layout) — see `plans/ui-shell/pending-action_and_slot_registry-med-med.md`
- ⬜ layout config store + OS AppData persistence — see `plans/ui-shell/pending-layout_config_store_persistence-med-med.md`
- ⬜ slot and action button components (vertical/horizontal rendering) — see `plans/ui-shell/pending-slot_and_action_button_components-med-med.md`
- ⬜ drag-and-drop with edit-mode gating (@dnd-kit/core) — see `plans/ui-shell/pending-dnd_edit_mode-med-hard.md`
- ⬜ active state tracking by action id — see `plans/ui-shell/pending-active_state_tracking-med-easy.md`
- ⬜ command palette (⌘K, Edit Action Layout, Reset Action Layout) — see `plans/ui-shell/pending-command_palette-med-med.md`
- ⬜ sidebar minimize toggle (VS Code-style collapse) — see `plans/ui-shell/pending-sidebar_minimize_toggle-med-med.md`
- ❌ commit 27bf273 "implement sidebar minimize toggle" only modified `mockup2.htm` — never implemented in actual app source (`apps/desktop/src/`)
