# Story: Calendar Tab UI

**Status:** pending · **Urgency:** high · **Difficulty:** hard

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

The discovery gate is CLOSED; full rationale and D1-D47 live in
`../pending-journal_discovery_and_wireframes-low-med.md`.

- **D4/D5:** values are user-defined; no mood scale, activity taxonomy, sentiment/health implication, hard-coded colors, or icons.
- **D14/D27:** calendar is a canvas tab opened from the journal popout, never a panel/activity-bar entry.
- **D25/D43:** day click filters shared popout state and never opens an entry; predicates match within one entry and counts/dots use matches only.
- **D29/D46:** week/month show up to three dots plus `+N`; accessible text announces exact counts.
- **D31:** keyboard/screen-reader support is required; high contrast is theme-owned; use `--tn-*` tokens.
- **D47:** register local tab kind `calendar` under `journal-calendar` as `journal-calendar.calendar`.

## Shipped tab registration path

Register local kind `calendar` through `DesktopExtensionContext.tabs.register()` with a
factory; the host prefixes it to `journal-calendar.calendar` (D47). `TabContent.tsx` already
subscribes to `desktopTabRegistry` and renders contributed factories before built-in branches,
so no shell or `packages/core` edit is required for rendering. `DesktopTabContext` remains
`{ rootPath, tabId }`; journal data comes from the service/workspace boundary. Opening from
the popout still depends on story 9 because `context.workspace` has no `openTab` method.

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

- Shipped tab registry/factory seam; story 9 must still provide an approved extension-facing tab-open route.
- Approved discovery desktop wireframe; remaining open items above still gate affected UI.
- Calendar data model implements D43 aggregation/filtering and D46 counts.
- `pending-journal_panel_ui-high-hard.md` must export a stable filter-state contract (shared filter state per D25).
- `--tn-*` design token set (no new tokens for this story).

## Acceptance criteria

- [ ] Calendar opens only from the popout through story 9's approved extension-facing tab-open route; no activity-bar entry or panel registration.
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

## Validation

- Automated: `CalendarTab.test.tsx`, view-model and tab-registry tests, plus `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`); `packages/core` remains unchanged for the tab kind.
- Desktop: validate approved mockups, range/filter/day states, dot overflow, options strip, themes, and the approved keyboard grid; open from the popout and confirm no activity-bar entry, toggle week/month, navigate, click a day to filter the popout, and clear the filter. Verify `TabContent.tsx` renders the factory result, and CSS uses `--tn-*` tokens with no hard-coded colors.
- Mobile calendar-tab behavior is an OPEN ITEM; do not implement phone-specific layout until that decision is recorded.

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
