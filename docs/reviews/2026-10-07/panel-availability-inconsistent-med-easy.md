# Panel `availability` is honored in one place of three — and clicking an unavailable panel silently does nothing

- **Urgency:** med
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/TitleBar.tsx`
- **Lines:** 361–443 (also `ActivityBar.tsx:37–46`, `DesktopShell.tsx:84–87`, `ActionItemsMenu.tsx:53–63`, `PhoneShell.tsx:146–152`)

## Description

`PanelContribution.availability` exists on both side-narrowed contribution
types (`panelRegistryModel.tsx:244, 253`), but consumers disagree about
whether it means anything:

- **Right dock:** `DesktopShell` gates `effectiveRightPanel` on
  `desktopPanelRegistry.isAvailable(rightPanel, panelContext)` — the dock is
  suppressed when the panel is unavailable.
- **Desktop ⋯ menu and pinned icons:** `TitleBar` lists *every* registered
  right panel with no availability check and receives no context to evaluate
  one. Clicking "Version history" with no document open fires
  `onToggleRightPanel` → `setRightPanel("history")` → the
  `effectiveRightPanel` gate suppresses the dock → the menu closes and
  **nothing visibly happens**. No disabled state, no feedback.
- **Phone action-items menu:** `ActionItemsMenu` evaluates
  `availability?.(context)` and renders a disabled row — the correct
  behavior.
- **Left side, both chromes:** `availability` is never consulted at all.
  `ActivityBar` maps every left contribution to an always-enabled icon
  (`tags` is even registered with `availability: () => false` and still gets
  a clickable icon that opens an `Unavailable` body), and `PhoneDrawer`'s
  `selectDrawerPanel` gates on `isSelectableLeftPanel` (registry membership)
  only. `LeftPanelContribution.availability` is effectively dead API: an
  extension declaring it on a left panel — or one whose lazy stub mounts
  `LazyExtensionPanel` — is selected and activated anyway.

Three different answers to the same question, and the desktop's answer is
the worst: a click that sets state but renders nothing.

## Recommendation

Evaluate `availability` in `DesktopShell` (it already builds `panelContext`)
and pass the resolved `ActionItems`/`visible`/`overflow` lists — or a
`isAvailable(id)` predicate — into `TitleBar`, disabling menu rows and bar
icons the way `ActionItemsMenu` does. For the left side, either honor
`availability` in `ActivityBar`/`PhoneDrawer` (disabled icon, no selection)
or drop the field from `LeftPanelContribution` and document that left
panels gate themselves via their factory body (the `tags`/`Unavailable`
pattern).

## Verification

With no file open, click the ⋯ menu → "Version history": the menu closes
and no dock opens. `grep -n "availability"` shows consumers only in
`DesktopShell.tsx:85`, `ActionItemsMenu.tsx:54`, `bubbleModel.ts`, and
`PhoneShell.tsx:263` — none on the left-side path (`ActivityBar`,
`LeftPopout`, `PhoneDrawer`).
