# Action and Slot Registry

**Goal:** Define the `ActionDef`, `SlotDef`, and `LayoutConfig` types, the
action registry (files, search, chat, command, settings), slot definitions
(six slots with orientations), and the default layout config.

**Acceptance criteria:**
- `ActionDef` interface with `id`, `icon`, `label`, optional `wide`
- `SlotDef` interface with `id`, `orient`
- `LayoutConfig` type (`Record<string, string[]>`)
- Action registry covering: files, search, chat, command, settings
- Slot registry covering: activity-bar-top, activity-bar-bottom, titlebar-left,
  titlebar-right, statusbar-left, statusbar-right (with correct orientations)
- Default layout config matching the epic's Default Layout section
- Unit tests verifying registry completeness and default layout validity
- Types live in `packages/core` (platform-agnostic); no React/DOM dependency

**File references:**
- New: `packages/core/src/layout/actionRegistry.ts`
- New: `packages/core/src/layout/slotRegistry.ts`
- New: `packages/core/src/layout/types.ts`
- Design source: `plans/archive/old-structure/007-movable-actions.md`
- Mockup reference: `mockup2.htm` (ACTIONS, SLOT_ORIENT, DEFAULT_LAYOUT)
