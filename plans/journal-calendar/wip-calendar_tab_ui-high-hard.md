# Story: Calendar Tab UI

**Status:** 🟨 in progress — grid, dots, keyboard, day-to-popout filter, tab
registration, view-mode persistence (D56/D79/D80) and the D57 phone layout all
shipped in `CalendarTab.tsx`/`CalendarTabContainer.tsx`. Remaining: metadata
predicates in the grid — D41 has since shipped, so this is now unblocked;
`CalendarTabContainer` still passes `predicates: []` and entry `values: {}`.

Part of [Journal & Calendar](journal-calendar). Mockup APPROVED —
`assets/journal-calendar-tab-mockup.html` (D79). Decisions D1-D88 in
`assets/journal_discovery_and_wireframes`.

## Key decisions (shipped)

- D14/D27: canvas tab only, opened from the popout via `context.tabs.open`;
  no panel or activity-bar entry. Registered as `calendar` with a `factory`;
  `TabContent.tsx` renders contributed factories before built-in branches —
  no shell/core edit (host prefixes to `journal-calendar.calendar`, D47).
- D25/D43: day click filters shared popout state (`journalFilterStore`),
  never opens an entry; predicates match within one entry; counts/dots use
  matches only.
- D29/D46: up to three dots plus `+N`; accessible text announces exact counts.
- D56/D79/D80: `open-calendar` focuses the existing tab; view mode persists
  per workspace; tab always opens on today's month.
- D57 phone: both views, option strip collapses to one control, dots only
  below 40px cells (container queries). D58: one tab stop, roving focus,
  arrows/Home/End/PageUp/PageDown/Enter. D59: day click opens the popout
  when closed. D60: day chip clears in step with calendar selection.
- D69/D70: scoped `tabs.open(kind, title)`; `DesktopTabContext` stays
  `{ rootPath, tabId }`.

## Acceptance criteria

- [x] Opens only from the popout through `context.tabs.open`; no activity-bar
      or panel entry.
- [x] Registered with a `factory`; `TabContent.tsx` and `packages/core` not
      edited for the kind (open union).
- [x] Week and month views selectable from the options strip.
- [x] Up to three dots plus `+N`; accessible text announces exact counts
      (D43/D46).
- [x] Day click filters the popout via shared filter state (D25); chip
      dismisses in step (D60).
- [x] No hard-coded mood/activity colors or icons; `--tn-*` only; no
      implied sentiment scale (D4).
- [x] Trouble states (no-workspace, invalid-root, unreadable) are explicit
      and actionable — the grid is withdrawn rather than showing false empties.
- [x] D58 keyboard model implemented; screen-reader announcements for cells,
      counts, and filter activation.
- [x] Desktop tests cover rendering, dots, day-selection filter sharing, and
      the options strip (`CalendarTab.test.tsx`, `CalendarTabContainer.test.tsx`).
- [ ] **Metadata predicates in the grid**: wire the active popout predicates
      and D41 facet values into `aggregateCalendarDays` so counts/dots reflect
      metadata filtering (D25/D43). Currently hardcoded `predicates: []`.

## Non-goals

No activity-bar button, taxonomy/colors/icons, service rewrite, mobile rework
beyond D57, notifications/streaks/AI, or shell/core edits. High contrast is
theme-owned.
