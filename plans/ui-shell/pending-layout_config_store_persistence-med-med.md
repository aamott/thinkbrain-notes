# Layout Config Store and Persistence

**Goal:** Create a Zustand `layoutStore` with `layout`, `moveAction`,
`resetLayout`, and `setActiveAct` actions. Persist layout config to OS
`AppData` via the Tauri settings layer (not localStorage, not in the vault).

**Acceptance criteria:**
- Zustand store with: `layout: LayoutConfig`, `moveAction(actionId, fromSlot, toSlot)`, `resetLayout()`, `setActiveAct(actionId)`, `activeActionId: string`
- `moveAction` removes action from source slot and appends to target slot
- `resetLayout` restores default layout from registry
- Store hydrated from Tauri settings on startup
- Debounced write to OS AppData on layout change
- Unknown action ids in saved layout are silently filtered on load
- Unit tests for moveAction, resetLayout, and unknown-id filtering
- Persistence path goes through `settingsService` / Tauri (consistent with existing settings pattern)

**File references:**
- New: `apps/desktop/src/stores/layoutStore.ts`
- New: `apps/desktop/src/stores/layoutStore.test.ts`
- Existing pattern: `apps/desktop/src/stores/appStore.ts`, `apps/desktop/src/settings/settingsService.ts`
- Design source: `plans/archive/old-structure/007-movable-actions.md` (Persistence, Production Notes)
