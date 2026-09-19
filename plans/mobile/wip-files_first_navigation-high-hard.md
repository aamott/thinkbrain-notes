# Files-first mobile navigation

## Goal

Make Files the mobile home screen and give notes browser-like Back history, while replacing ambiguous mobile menus with right-edge navigation and inspector flows. Desktop remains unchanged except for an explicit close/back control in right-panel headers.

## Architecture

Phone navigation is a small browser-history-backed route model owned by phone chrome, separate from tab order and shared shell state. Base routes are Files, another left panel, or an open tab; transient routes are navigation, tabs, action items, and a selected inspector. Cold mount/workspace change starts at Files, while an in-memory app resume preserves its current route. Android system Back and visible Back use the same history.

Panel and command options continue to come from the contribution registries. The `…` menu lists right-panel contributions, and selection opens the existing right-panel content in a bounded right-edge inspector drawer. The bottom Menu remains the only launcher for the app navigation drawer.

## Acceptance criteria

- Mobile cold launch and workspace change show Files even when tabs are restored; background/resume does not reset the route.
- Opening files, wiki links, search results, extension-driven notes, or tabs adds visit history; Back revisits available entries and eventually reaches Files without closing tabs.
- Renamed or closed historical tabs are reconciled without trapping navigation.
- The header hamburger is removed. Always-visible Back and Forward controls traverse content and overlay history and clearly disable at their boundaries.
- The header location is a rounded breadcrumb pill that keeps the current file visible at the right edge, fades clipped ancestors on the left, and opens a compact outside-dismissible path bubble with native horizontal drag/scroll.
- Android system Back and visible Back dismiss the topmost menu/drawer/sheet before navigating content history; at Files root normal platform behavior remains.
- The bottom Menu opens the contribution-driven navigation drawer from the right.
- Header `…` opens an anchored Action items menu. Outside tap/Escape closes it; selecting an available item opens its right panel from the right.
- The inspector drawer starts below the phone header, ends above the bottom navigation/safe area, and outside tap closes the complete inspector flow. Its Back control returns to the Action items menu.
- Selecting a right-panel shortcut directly from the bottom navigation opens the same inspector and Back returns to the prior content route.
- Files folder expansion, selection, and scroll state survive opening a document and returning.
- Right-panel headers expose an optional leading Back control. On desktop it closes the dock; no other desktop navigation changes.
- Menus and drawers preserve registry extensibility, focus return, keyboard navigation, accessible names, and touch-sized controls.
- Focused navigation/overlay tests and `pnpm qa` pass; Android and desktop are visually checked with running development clients.
