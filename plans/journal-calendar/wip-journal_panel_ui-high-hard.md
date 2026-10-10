# Story: Journal Panel UI

**Status:** 🟨 in progress · **Urgency:** high · **Difficulty:** hard

Shipped: `journalViewModel.ts`, `JournalPanel.tsx`, `JournalPanelContainer.tsx`,
`JournalEntryList` virtualization, `MetadataWidget.tsx` + container, filter
control + `journalFacets.ts`, `journalFilterStore.ts`, collapse persistence —
registered via `extensions/builtins/journal.tsx`. Remaining: the open platform
gap below, plus final state/focus verification.

## Goal

The approved journal list/create/open experience: a flat virtualized
navigator, full-text search and metadata filters, and the D44
collapsed-dateline widget above the editor body. Popout navigator only — no
calendar, no editor fork. Approved mockup: `assets/journal-panel-mockup.html`
(D71-D75); decisions D1-D88 in `assets/journal_discovery_and_wireframes`.

## Key decisions (shipped behavior)

- Service is built in `activate()` from `context.workspace`; the panel is
  presentational — `DesktopPanelContext` needed no change.
- The widget uses D44's React editor-header registry (`metadata-widget`), not
  CodeMirror hooks/portals; it edits the open document, so Save stays the
  only writer.
- Virtualization: row heights derive from the `JournalRow` visual class, then
  are measured (coarse-pointer min D76, width tiers D55/D72, font size all
  move them); a row always reserves its preview line; window math lives in
  `lib/listWindow.ts`.
- Facet vocabulary is queried unfiltered, matches filtered — otherwise
  ticking `mood good` would erase the alternatives (D16/D41/D43).
- While the index is away, predicates stay in memory but show as inactive
  (no chip/badge lying over an unfiltered list). "Clear all" clears search
  too. Collapse state persists per workspace, bounded by the
  recent-workspace list (D53).
- Styling is Tailwind/`--tn-*` only — the app has zero `.module.css` files.

## Open platform gap — the remaining work

`Open folder…` and `Open settings`: D63's copy gives those states an action,
but the extension API exposes no route to a host command (an extension can
register commands, not run another's). The panel takes both handlers as
optional and renders the button only when supplied; the built-in supplies
neither. Needs a decision on whether extensions may invoke host commands.

## Acceptance criteria

- [x] Popout registers local id `journal` (`journal-calendar.journal`) via
      `context.panels.register(...)`, `side: "left"`; no registry mutation (D47).
- [x] Navigator: every row opens a normal editor tab; no inline editing.
- [x] Header D71/D75: New entry (only filled control), Today, Open calendar,
      then search, then right-aligned filter (D73); no group-by control.
- [x] "Today" opens today's most recent entry or creates one (D18).
- [x] Flat virtualized stream, collapsible year + month headers (D37/D39);
      thousands of entries without thrash (D13).
- [x] Filename-derived dates; lazy first-line previews for visible rows only.
- [x] Undated pinned collapsed with count, absent when empty; non-Markdown
      excluded (D32/D36).
- [x] Active filters: count badge + chip row + "showing N of M" (D16); count
      in the filter button's accessible name; per-predicate dismissible chips.
- [x] Facet values from D41 queries; predicates match within one entry (D43);
      search runs inside the match set; index-unavailable disables only facets.
- [x] `metadata-widget` via D44 registry: appears in already-open editors,
      disposes cleanly, D28 triggers, D35 dateline with year (D74), expands.
- [x] Malformed frontmatter and filename/date mismatch show non-blocking
      notices; single-key edits via `frontmatterEdit.ts` keep order/comments.
- [ ] All fourteen UI states use the approved mockup's copy **and** recovery
      actions — blocked on the `Open folder…`/`Open settings` route above.
- [ ] Focus order matches the discovery spec; screen-reader roles/names/live
      regions verified; `--tn-*` tokens only (D31).
- [ ] Full desktop test sweep confirmed: dirty state, panel toggling, and all
      listed behaviors (most already covered — see `*.test.tsx` neighbours).
- [x] `DesktopPanelContext` gap resolved: service built from
      `context.workspace` in `activate()`; panel is presentational.

## Non-goals

No calendar view, group-by, mood colors/emoji/taxonomy (D4), mobile redesign
(`journal_mobile_refinement`), indexing, reminders, AI, or D44 registry
reimplementation. High contrast is theme-owned.
