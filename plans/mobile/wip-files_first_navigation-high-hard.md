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
- The header hamburger is removed. The header owns always-visible Back and Forward controls that traverse content and overlay history and clearly disable at their boundaries; `PhoneHeader`/`ActionItemsMenu` also support an alternate menu presentation behind optional props (not enabled — a history-backed menu overlay would truncate Forward).
- The header location is a rounded breadcrumb pill that centers while the path fits, right-anchors once clipped ancestors overflow (fading them at the left), and opens a compact outside-dismissible path bubble with native horizontal drag/scroll.
- Android system Back and visible Back dismiss the topmost menu/drawer/sheet before navigating content history; at Files root normal platform behavior remains.
- The bottom Menu opens the contribution-driven navigation drawer from the right.
- Header `…` opens an anchored Action items menu listing Saved versions plus the right-panel contributions. Outside tap/Escape closes it; selecting an available item opens its right panel from the right. Menus support arrow/Home/End keyboard navigation, and both Saved versions entry points clear any note-specific filter.
- Peer surfaces never stack when launched directly: a direct launcher for the drawer, tab switcher, action menu, New note popup, or a content-parented inspector replaces the current overlay in place, so Back lands on content rather than resurrecting a stale surface. Switching away from an actions-parented inspector does not collapse its two-entry drill-in; the actions → inspector drill-in is the explicit exception and pushes a second entry.
- Hub slots toggle their surface: a visible left panel returns to prior content, an open right-panel inspector closes, and Menu/New note close their drawer or popup. The navigation drawer and its scrim end above the hub so Menu stays directly tappable.
- The New note hub slot opens a compact anchored popup offering Create new note (the canonical Explorer create flow over Files) and Open most recent note — a two-entry MRU that offers the *previous* distinct note while viewing one (A/B toggle) and the open note otherwise; it always reopens the existing tab, never duplicates.
- The shell root uses `overflow-clip` so offscreen-translated sheets cannot let Android/WebView focus-scroll the whole shell off-screen.
- The inspector drawer starts below the phone header, ends above the bottom navigation/safe area, and outside tap closes the complete inspector flow. Its Back control returns to the Action items menu.
- Selecting a right-panel shortcut directly from the bottom navigation opens the same inspector and Back returns to the prior content route.
- Files folder expansion, selection, and scroll state survive opening a document and returning.
- Right-panel headers expose an optional leading Back control. On desktop it closes the dock; no other desktop navigation changes.
- Menus and drawers preserve registry extensibility, focus return, keyboard navigation, accessible names, and touch-sized controls.
- Focused navigation/overlay tests and `pnpm qa` pass; Android and desktop are visually checked with running development clients.
