# Active State Tracking by Action ID

**Goal:** Track the active action by action id (not hardcoded element ids)
so the blue indicator follows an action button regardless of which slot it
currently lives in.

**Acceptance criteria:**
- `activeActionId` tracked in `layoutStore`
- `setActiveAct(actionId)` updates the active action id
- Action buttons read `activeActionId` from store and apply `active` class when their id matches
- Active state re-applies automatically after slot re-renders (store-driven, not manual DOM manipulation)
- Clicking an action sets it as active (in addition to dispatching its handler)
- Works correctly after dragging an action to a different slot

**File references:**
- Modify: `apps/desktop/src/stores/layoutStore.ts` (activeActionId, setActiveAct)
- Modify: `apps/desktop/src/layout/ActionButton.tsx` (active class from store)
- Design source: `plans/archive/old-structure/007-movable-actions.md` (Active State)
- Mockup reference: `mockup2.htm` (refreshActiveState, setActiveAct)
