# Story: Calendar Tab UI

**Status:** pending · **Urgency:** high · **Difficulty:** hard

> **Filename note:** This file is currently named `pending-calendar_panel_ui-high-hard.md`. It should be renamed to `pending-calendar_tab_ui-high-hard.md` to reflect that the calendar is a canvas TAB, not a panel (D27). The registration path is the tab-kind registry, not the panel registry — to be confirmed against the actual tab-kind registry before implementation begins.

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

Decisions from `../pending-journal_discovery_and_wireframes-low-med.md` that bind this story:

- **D4** — Daily metadata fields are USER-DEFINED in extension settings. The app ships NO mood scale and NO activity taxonomy. No hard-coded mood colors or activity icons.
- **D5** — (see D4; user-defined vocabulary). Visual encoding must not assume or imply a sentiment/health scale.
- **D14** / **D27** — **The calendar is a CANVAS TAB, NOT a panel.** It does NOT register an activity-bar contribution. There is NO calendar activity-bar button. It opens from a button in the journal popout into a canvas tab. Registration goes through the tab-kind registry, not the panel registry.
- **D25** — Clicking a day FILTERS THE POPOUT LIST to that day. It does not open an entry. Calendar and popout SHARE filter state.
- **D29** — One dot PER ENTRY, capped. Cap value and overflow treatment are UNDECIDED (open item below).
- **D31** — Keyboard operation and screen-reader compatibility are must-haves. High contrast is OUT OF SCOPE (themes own it); use `--tn-*` tokens only.

The discovery gate is CLOSED for the decisions above. See the discovery story for the full rationale.

## Questions first — STOP gate (still open for this story)

The items below are **genuinely undecided**. Do not implement the affected surfaces until each is resolved and recorded.

1. **Dot cap value and overflow treatment:** What is the cap on dots per day cell? What is rendered when overflow occurs (e.g. "+N" label, truncated row, single aggregate dot)?
2. **Dots in week view:** Does the week view show dots per entry the same way as month view, or does it show a count/bar?
3. **Tab singleton and option persistence:** Is the calendar tab a singleton (only one can be open)? Do the options-strip selections (week vs month, active date) persist across tab closes?
4. **Calendar on a phone:** How does the canvas tab behave at phone widths? This is not resolved by D12/D26 (which apply to the popout, not the tab).
5. **Calendar grid keyboard model:** Roving-focus model, month paging keys, and activation semantics for day cells need their own accessibility pass. Do NOT guess — mark as a STOP gate.
6. **Day click when the popout is closed:** If the user clicks a day and the popout is not open, does it open? Does the filter still apply?
7. **Date filter as a dismissible chip:** Does the active day filter appear in the popout as a chip that the user can dismiss independently of the calendar tab?

**STOP gate:** Do not implement the grid, dot rendering, day-selection behavior, or keyboard model until each open item above has a product-owner decision recorded in the discovery story.

## Goal

Implement the approved calendar navigation surface as a canvas tab that opens from the journal popout. Renders week and month views with one dot per entry (capped). Day selection filters the journal popout list; calendar and popout share filter state. Options strip at the top of the tab. Uses `--tn-*` tokens only; no hard-coded mood/activity colors.

## Scope

- Canvas tab surface, opened exclusively from the "Open calendar" button in the journal popout (D14/D27). No activity-bar button.
- Week view and month view, selectable from the options strip at the top of the tab.
- First release: one dot per entry per day cell, capped (cap value is an open item).
- Day click: filters the journal popout list to that day; does not open an entry (D25).
- Calendar and popout share filter state.
- `--tn-*` tokens only; no hard-coded colors for mood/activity (D4).

## Likely files

- `apps/desktop/src/journal/CalendarTab.tsx` (new; replaces the previously scoped `CalendarPanel.tsx`).
- `apps/desktop/src/journal/CalendarTab.module.css` (new; CSS Modules, `--tn-*` tokens only).
- `apps/desktop/src/journal/CalendarTab.test.tsx` (new).
- `apps/desktop/src/journal/calendarViewModel.ts` and test (new, if state/query mapping merits separation).
- `apps/desktop/src/tabs/tabRegistry.tsx` or equivalent tab-kind registry (register calendar tab kind; confirm the exact registry before editing — do NOT use `panelRegistry.tsx`).
- `apps/desktop/src/tabs/tabModel.ts` (minimal, only to register the canvas tab kind and its open action).
- Shared filter-state interface between `JournalPanel` and `CalendarTab` — location TBD when popout-story contract is stable.

Do NOT touch `apps/desktop/src/shell/ActivityBar.tsx` for the calendar — no activity-bar entry.

## Dependencies

- Approved discovery desktop wireframe (closed for D14/D27/D25/D29); open items above must be resolved before grid implementation.
- Calendar data model/aggregation story (per-day aggregation logic is provisional; D8).
- `pending-journal_panel_ui-high-hard.md` must export a stable filter-state contract (shared filter state per D25).
- Existing tab-kind registry — location and API must be confirmed against actual codebase before registering.
- `--tn-*` design token set (no new tokens for this story).

## Acceptance criteria

- [ ] Calendar opens only from the journal popout "Open calendar" button into a canvas tab; no activity-bar entry or panel registration.
- [ ] Registration goes through the tab-kind registry, not the panel registry.
- [ ] Week view and month view are selectable from the options strip at the top of the tab.
- [ ] First release renders one dot per entry per day cell, capped; cap value and overflow treatment implemented per the product-owner decision recorded in the discovery story.
- [ ] Clicking a day filters the journal popout list to that day; clicking again or clearing dismisses the filter; calendar and popout share the same filter state object.
- [ ] No hard-coded mood/activity colors or icons; `--tn-*` tokens only; visual encoding does not imply a sentiment scale (D4).
- [ ] Loading, empty-range, no-workspace, and error states are explicit, distinct, and actionable.
- [ ] Keyboard model for the grid (roving focus, month paging, activation) is implemented per the product-owner decision recorded in the discovery story; NOT guessed.
- [ ] Screen-reader announcements for day cells, entry counts, and filter activation are correct.
- [ ] CSS uses co-located CSS Modules and `--tn-*` tokens; no inline styles.
- [ ] Desktop tests cover rendering, data states, dot rendering, day-selection filter sharing, and options-strip interaction.

## Tests / manual checks

- `CalendarTab.test.tsx`, view-model tests, tab-registry tests, lint/typecheck/full QA.
- Manual desktop: open calendar tab from popout button (confirm no activity-bar entry exists), toggle week/month view, navigate forward/backward, click a day and verify popout list filters, clear filter, verify dot cap rendering and overflow treatment, switch theme, keyboard navigation per the approved model.
- Verify no hard-coded colors; inspect CSS for `--tn-*` token usage.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`). All calendar/view-model/tab-registry tests must pass.

## Manual desktop/mobile checks

Desktop: validate approved iterative mockups, range/filter/day states, dot rendering, options strip, keyboard grid model, and themes. Mobile: calendar tab behavior on a phone is an OPEN ITEM; do not implement phone-specific calendar layout until that decision is recorded.

## Non-goals

- No calendar activity-bar button or panel registration.
- No hard-coded mood/activity taxonomy, colors, or icons.
- No journal service rewrite, mobile refinement (blocked by open item), notifications, streaks, AI/sentiment inference, or extension-host registration.
- High contrast is out of scope (themes own it).
- Do not decide a final visualization or mood/activity palette in implementation.

## Handoff artifacts

The following stories need from this one:

- Confirmed tab-kind registry location and registration API (needed by `journal_extension_host_integration`).
- Stable filter-state interface (shared with journal popout) so `journal_panel_ui` and this story can consume the same state slice.
- Dot rendering component API (needed if calendar data model story adds per-day aggregation logic).
- Open items list (dot cap, keyboard model, phone behavior) forwarded to product owner for resolution before grid implementation begins.
