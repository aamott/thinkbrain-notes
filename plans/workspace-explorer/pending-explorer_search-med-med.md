# Story: Explorer-integrated search

Search input inside the workspace explorer panel. Typing swaps the file tree
for a debounced content-result list; clearing (or Esc) restores the tree
exactly. Interactive mockup of the chosen approach:
`apps/desktop/demo/explorer-search-mockup.html`.

## Decisions (made with owner)

- **Interaction — result-mode swap** (mockup approach B). A non-empty query
  renders the result list in place of the tree; the tree stays mounted but
  hidden so expansion, scroll, and active-row state survive the round trip.
  Filter-in-place (A) and split hybrid (C) were considered and rejected — see
  mockup for why.
- **Content search, same as today's popout.** FTS index via
  `searchService.search` — filename/title/tags/body, 300ms debounce,
  stale-result suppression. Do not build a parallel filename filter.
- **Tools row.** A filter button sits to the right of the input and wraps to
  its own row below it on narrow panels (flex-wrap + input flex-basis — no
  breakpoints). First menu item: "Group by folder" (collapsible folder
  sections mirroring the tree hierarchy). Later options join the same row.
- **Standalone Search panel stays registered.** It is a routed phone
  destination (`{ kind: "panel", panel: "search" }`) and an activity-bar
  entry; removing it is a separate decision. But the `openSearch` command now
  reveals the explorer and focuses its input — that is the merged UX.
- **Query persists after opening a result**, so going back keeps context.
  Esc clears the query and returns focus to the tree.

## Non-goals (follow-ups, not this story)

- `in: folder` scope chip + context-menu "Search in this folder"
  (`searchService.search` already accepts `pathPrefix` — plumbing only).
- "Reveal in explorer" on a result row (expand ancestors + select).
- Removing the standalone search panel / its activity-bar entry.
- Result virtualization — `search_index` caps at 200 hits.

## Acceptance

- [ ] Search input row renders under the explorer chrome when
      `state.phase === "ready"`; tools wrap below the input on narrow widths
      and meet `pointer-coarse` touch targets.
- [ ] Typing shows debounced content results (name + snippet rows matching
      `SearchPanel`'s presentation); clearing/Esc restores the prior tree —
      expansion, scroll position, active row.
- [ ] Input disabled with an inline hint while `useSearchIndexStore` reports
      `indexing`/`error`; hidden or inert without a workspace.
- [ ] "Group by folder" filter groups hits by parent directory into
      collapsible sections; state resets appropriately on clear.
- [ ] `openSearch` reveals the explorer and focuses the input via a
      request-prop pattern like `newNoteFocusRequest`.
- [ ] Activating a result opens the file through the explorer's existing
      file-open path; query and results persist afterwards.
- [ ] Standalone search panel, activity bar, and phone routes unchanged.
- [ ] Tests: swap/restore, status gating, grouping, focus request,
      stale-result guard still covered. `pnpm qa` green.

## Seams

- `search/SearchPanel.tsx` — debounce, `requestSeq` stale guard, result rows;
  the shared machinery to reuse or extract (dev's call).
- `search/searchIndexStore.ts` — index lifecycle gating for the input.
- `workspace/WorkspaceExplorerView.tsx` — chrome row + tree region where the
  input and swap live.
- `workspace/WorkspaceExplorer.tsx` — `newNoteFocusRequest` precedent for the
  focus plumbing; `handleFileSelected` for result activation.
- `shell/useShellCommands.ts` — `openSearch` repoint.
- `shell/Menu.tsx` — `Menu`/`MenuCheckbox` for the filter popover.
