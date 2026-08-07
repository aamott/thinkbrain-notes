# Story: Calendar Tab UI

**Status:** pending · **Urgency:** high · **Difficulty:** hard

> **Historical note:** This file was renamed from `pending-calendar_panel_ui-high-hard.md` to `pending-calendar_tab_ui-high-hard.md` per D27 (the calendar is a canvas TAB, not a panel).

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

Decisions from `../pending-journal_discovery_and_wireframes-low-med.md` that bind this story:

- **D4** — Daily metadata fields are USER-DEFINED in extension settings. The app ships NO mood scale and NO activity taxonomy. No hard-coded mood colors or activity icons.
- **D5** — (see D4; user-defined vocabulary). Visual encoding must not assume or imply a sentiment/health scale.
- **D14/D27** — Calendar is a canvas tab, never a panel/activity-bar entry. It opens from the journal popout through the shipped tab contribution path.
- **D25** — Clicking a day FILTERS THE POPOUT LIST to that day. It does not open an entry. Calendar and popout SHARE filter state.
- **D29/D46** — Month and week show up to three matching-entry dots, then `+N`; accessible text announces the exact count.
- **D31** — Keyboard operation and screen-reader compatibility are must-haves. High contrast is OUT OF SCOPE (themes own it); use `--tn-*` tokens only.
- **D43** — Active metadata predicates must match within one entry; filtered dots/counts represent matching entries only.
- **D47** — Register local tab kind `calendar` under extension `journal-calendar`, yielding `journal-calendar.calendar`.

The discovery gate is CLOSED for the decisions above. See the discovery story for the full rationale.

## Shipped tab contribution path

Register local kind `calendar` through `DesktopExtensionContext.tabs.register()` with a
factory; the host prefixes it to `journal-calendar.calendar` (D47). `TabContent.tsx` already
subscribes to `desktopTabRegistry` and renders contributed factories before built-in branches,
so no shell or `packages/core` edit is required. `DesktopTabContext` remains `{ rootPath,
tabId }`; journal data comes from the service/workspace boundary.

## Questions first — STOP gate (still open for this story)

The items below are **genuinely undecided**. Do not implement the affected surfaces until each is resolved and recorded.

1. **Tab singleton and option persistence:** one calendar tab or many; persistence for week/month and active date.
2. **Calendar on a phone:** canvas-tab layout at phone widths.
3. **Calendar grid keyboard model:** roving focus, paging keys, and activation semantics.
4. **Day click with popout closed:** whether the popout opens and how the filter is surfaced.
5. **Date filter chip:** whether the active day filter is independently dismissible in the popout.

**STOP gate:** Registration and D46 dot rendering are unblocked. Do not implement the remaining option persistence, phone layout, day-routing, chip behavior, or keyboard model until approved.

## Goal

Implement the approved calendar canvas tab with week/month views, D46 three-dot-plus-overflow density, shared D43 filter state, day-to-popout navigation, and token-only styling.

## Scope

- Canvas tab surface, opened exclusively from the "Open calendar" button in the journal popout (D14/D27). No activity-bar button.
- Week view and month view, selectable from the options strip at the top of the tab.
- Both views use D46: up to three matching-entry dots plus `+N`; exact count in accessible text.
- Day click: filters the journal popout list to that day; does not open an entry (D25).
- Calendar and popout share filter state.
- `--tn-*` tokens only; no hard-coded colors for mood/activity (D4).

## Likely files

- `apps/desktop/src/journal/CalendarTab.tsx` (new; replaces the previously scoped `CalendarPanel.tsx`).
- `apps/desktop/src/journal/CalendarTab.module.css` (new; CSS Modules, `--tn-*` tokens only).
- `apps/desktop/src/journal/CalendarTab.test.tsx` (new).
- `apps/desktop/src/journal/calendarViewModel.ts` and test (new, if state/query mapping merits separation).
- `apps/desktop/src/extensions/builtins/journalCalendarExtension.tsx` — register D47 local tab kind `calendar` with a factory.
- `apps/desktop/src/tabs/tabRegistry.ts` and `TabContent.tsx` — existing seam/tests only; no rendering branch or core `TabKind` change.
- Shared filter-state interface between `JournalPanel` and `CalendarTab` — location TBD when popout-story contract is stable.

Do NOT touch `apps/desktop/src/shell/ActivityBar.tsx` for the calendar — no activity-bar entry.

## Dependencies

- Shipped tab registry/factory seam; no tab-contribution prerequisite.
- Approved discovery desktop wireframe; remaining open items above still gate affected UI.
- Calendar data model implements D43 aggregation/filtering and D46 counts.
- `pending-journal_panel_ui-high-hard.md` must export a stable filter-state contract (shared filter state per D25).
- `--tn-*` design token set (no new tokens for this story).

## Acceptance criteria

- [ ] Calendar opens only from the journal popout "Open calendar" button into a canvas tab; no activity-bar entry or panel registration.
- [ ] The calendar kind is registered with a `factory`; `TabContent.tsx` is NOT edited. A registration without a factory is a defect.
- [ ] `packages/core` is unchanged — `TabKind` is already an open union, so adding a kind needs no core edit.
- [ ] Week view and month view are selectable from the options strip at the top of the tab.
- [ ] Month and week views render up to three matching-entry dots plus `+N`; accessible text announces the exact count (D43/D46).
- [ ] Clicking a day filters the journal popout list to that day; metadata predicates match within one entry and filtered counts/dots use matching entries only (D25/D43).
- [ ] No hard-coded mood/activity colors or icons; `--tn-*` tokens only; visual encoding does not imply a sentiment scale (D4).
- [ ] Loading, empty-range, no-workspace, and error states are explicit, distinct, and actionable.
- [ ] Keyboard model for the grid (roving focus, month paging, activation) is implemented per the product-owner decision recorded in the discovery story; NOT guessed.
- [ ] Screen-reader announcements for day cells, entry counts, and filter activation are correct.
- [ ] CSS uses co-located CSS Modules and `--tn-*` tokens; no inline styles.
- [ ] Desktop tests cover rendering, data states, dot rendering, day-selection filter sharing, and options-strip interaction.

## Tests / manual checks

- `CalendarTab.test.tsx`, view-model tests, tab-registry tests, lint/typecheck/full QA.
- Manual desktop: open calendar tab from popout button (confirm no activity-bar entry exists), toggle week/month view, navigate forward/backward, click a day and verify popout list filters, clear filter, verify dot cap rendering and overflow treatment, switch theme, keyboard navigation per the approved model.
- Verify `TabContent.tsx` renders the new kind (not a blank or error state).
- Verify no hard-coded colors; inspect CSS for `--tn-*` token usage.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`). Calendar, view-model, and tab-registry tests must pass; `packages/core` remains unchanged for the tab kind.

## Manual desktop/mobile checks

Desktop: validate approved iterative mockups, range/filter/day states, dot rendering, options strip, keyboard grid model, and themes. Mobile: calendar tab behavior on a phone is an OPEN ITEM; do not implement phone-specific calendar layout until that decision is recorded.

## Non-goals

- No calendar activity-bar button or panel registration.
- No hard-coded mood/activity taxonomy, colors, or icons.
- No journal service rewrite, mobile refinement (blocked by open item), notifications, streaks, AI/sentiment inference, or extension-host registration.
- High contrast is out of scope (themes own it).
- Do not decide a final visualization or mood/activity palette in implementation.
- Do not bypass D47 host prefixing or edit shell/core to add a built-in tab kind.

## Handoff artifacts

The following stories need from this one:

- D47 tab registration contract: local `calendar`, full `journal-calendar.calendar`, factory through `context.tabs.register()` (needed by extension-host integration).
- Stable filter-state interface (shared with journal popout) so `journal_panel_ui` and this story can consume the same state slice.
- D46 dot/overflow component API consuming the calendar model's exact, visible-dot, and overflow counts.
- Remaining open items (keyboard model, phone behavior, persistence and day-routing/chip behavior) forwarded before affected UI work.
