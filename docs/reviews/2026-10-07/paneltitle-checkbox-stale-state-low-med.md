# Panel menu checkbox keeps the menu open but shows a stale checked state

- **Urgency:** low
- **Difficulty:** med
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/PanelTitle.tsx`
- **Lines:** 133–142, 178–185

## Description

A checked `PanelMenuItem` deliberately keeps the dropdown open after being
toggled (`onRun(false)`), "so a toggle's new state stays visible" — but
nothing makes the new state visible. `item.checked` is static data: it comes
from the contribution's `actions` (a literal array, or a factory that only
re-runs when the popout re-renders). After `run()` fires, the still-open
menu re-renders the same `checked` prop, so `MenuCheckbox`'s `aria-checked`
and the ✓ glyph show the *old* value until something above re-renders the
popout. For an extension-contributed action whose state lives outside the
shell's React state that may be never — the user sees a checkbox that
appears not to have toggled, and a screen reader announces the pre-toggle
state.

Minor related nit in the same map: `key={item.label}` (line 135) collides
when an extension contributes two menu items with the same label, breaking
item identity.

## Recommendation

Track optimistic local state in `PanelMenuAction`/`PanelMenuEntry` — flip a
local `checked` copy on run so the open menu reflects the toggle, then let
the next real `actions` resolution take over. Alternatively close the menu
on checkbox items like plain items, trading the "see the new state" goal for
never showing a wrong one. Use `key={`${index}-${item.label}`}` for the
label-collision.

## Verification

`PanelTitle.tsx:133–142` maps `action.menu` straight into entries with no
state write-back; `MenuCheckbox` (Menu.tsx:254–279) renders `aria-checked`
purely from props. The test at `PanelTitle.test.tsx:155–160` asserts the
menu stays open but does not assert `aria-checked` flips — it cannot, since
the fixture's `checked: true` is a literal.
