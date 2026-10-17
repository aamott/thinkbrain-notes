# Location-Centric History

**Status:** done · **Urgency:** high · **Difficulty:** hard

Make global Back/Forward return to document locations, including within one
file. Preserve the latest text and undo state; navigation is never Undo.

## Architecture

- Keep one bounded, in-memory `entries + cursor` timeline. Each entry has a
  numeric visit id, a lightweight tab/resource descriptor, and an optional
  selection/scroll location. Do not maintain a parallel tab-id log.
- Keep transition logic pure. A shell dispatch boundary captures the live
  departure position before open, activation, jump, or history traversal.
  Typing, scrolling, and ordinary cursor movement never append visits.
  No-op navigation preserves Forward; a new destination truncates it.
- Keep latest editor text/undo in the existing per-tab cache. A small live-view
  registry captures/applies positions and reports document changes. Map
  historical anchors through local edits; clamp safely after replacement.
  Preserve the viewport's offset within its anchored text, not just its line.
- Restore only when the destination editor has the latest document loaded.
  Guard pending restores by visit identity; same-file traversal must work
  without remounting. Failed loads show an error, not stale cached text.
- Explicit close removes that tab's visits. Preview/`replace-active` takeover
  is navigation, not close: retain the displaced resource and reopen it on
  Back through existing loaders, without keeping every preview visibly open.
  Never displace dirty work to restore a visit.
- Rename rewrites both open and retained destinations. Workspace changes
  reset the timeline; visit ids must not accidentally identify new visits
  when an older phone browser-history entry resurfaces.
- Phone keeps Home (Files), panels, and inspector destinations in its browser
  routes, with document routes referencing shared visit ids. It does not
  duplicate document anchors. Dismiss overlays/menus before content.
  Header, Android Back, palette, keyboard, and mouse use the mounted chrome's
  navigation and availability.

## Scope

Implement location capture/restore, preview revisits, phone parity, and
clickable outline headings. Heading/fragment links and exact search-hit jumps
are follow-up features, not prerequisites.

## Acceptance criteria

- Outline jump, Back, and Forward restore selection and viewport, including
  when the user moved within a visit before leaving. Text/undo are unchanged.
- Insertions/deletions map anchors; external replacement cannot produce
  out-of-range selections or resurrect old contents.
- Preview A -> B -> Back reopens A using its current file contents. Explicit
  close scrubs visits; mid-history close preserves the surviving visit.
- No-op activation preserves Forward; fresh navigation truncates it. Rename
  follows retained resources; workspace changes cannot revisit another vault.
- Phone Home -> note -> outline jump traverses the same document locations,
  with overlays dismissed first and all Back/Forward inputs agreeing.
- Focused reducer/editor/shell tests and real-browser desktop/phone scroll
  tests pass, followed by `pnpm qa`.

Key files: `apps/desktop/src/tabs/tabModel.ts`,
`apps/desktop/src/tabs/tabHistory.ts`,
`apps/desktop/src/tabs/editorLocationRegistry.ts`,
`apps/desktop/src/shell/useLocationHistory.ts`,
`apps/desktop/src/shell/phone/usePhoneNavigation.ts`
