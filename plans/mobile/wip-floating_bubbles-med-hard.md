# Phone Floating Bubbles

**Status:** 🟨 wip · **Urgency:** med · **Difficulty:** hard

Replace the phone bottom hub with contextual floating bubbles and move the
main menu into the header. Approved 2026-10-04.

## Design

- **Header:** Back / Forward / breadcrumb / tab count / **☰** (main menu).
  ☰ opens the navigation drawer (workspace selector, left panels, Settings),
  full height from the top right.
- **Bubbles** float over content; only the bubbles take pointer events.
  Left group, left-aligned; right group, right-aligned — a hidden bubble
  lets its neighbour shift over.

| Bubble | Group | Visible when | Tap |
|---|---|---|---|
| ⌂ Home | left, 1st | any route except Files | push Files (Back returns); conflict badge |
| + New note | left, 2nd | Files, or a Markdown note tab | New-note popup (create / extension actions / recent) |
| ⋮ Actions | right | ≥1 action item available | action-items menu, opens upward |

- Hidden while the soft keyboard is open. Content gets bottom scroll padding
  so the last lines can clear the bubbles.
- `ui.mobileBubbleLabels` (default off): labels render inside the bubble
  as a pill (`⌂ Home`).
- Removed: `PhoneHub`, `BottomNav`, hub model/editing, `useHubItems`,
  `MobileHubControl`, `ui.mobileHub`, long-press pinning. Stale values are
  ignored by the settings loader.

## Architecture

Pure `bubbleModel.ts` (`resolveBubbles` → `{ left, right }`), presentational
`FloatingBubbles` in `packages/ui`, `PhoneShell` maps bubble ids to handlers.

## Steps

- [x] 1. Behaviour-neutral split of `PhoneShell.tsx` into hooks.
- [x] 2. Header ☰ opens the drawer; drawer full height.
- [x] 3. Bubbles + labels setting; delete the hub; ⋮ notification badge.
- Then `contextual_action_items` (ui-shell).
