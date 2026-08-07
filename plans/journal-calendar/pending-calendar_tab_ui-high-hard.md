# Story: Calendar Tab UI

**Status:** pending · **Urgency:** high · **Difficulty:** hard

> **Historical note:** This file was renamed from `pending-calendar_panel_ui-high-hard.md` to `pending-calendar_tab_ui-high-hard.md` per D27 (the calendar is a canvas TAB, not a panel).

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

Decisions from `../pending-journal_discovery_and_wireframes-low-med.md` that bind this story:

- **D4** — Daily metadata fields are USER-DEFINED in extension settings. The app ships NO mood scale and NO activity taxonomy. No hard-coded mood colors or activity icons.
- **D5** — (see D4; user-defined vocabulary). Visual encoding must not assume or imply a sentiment/health scale.
- **D14** / **D27** — **The calendar is a CANVAS TAB, NOT a panel.** It does NOT register an activity-bar contribution. There is NO calendar activity-bar button. It opens from a button in the journal popout into a canvas tab. There is no extension-contribution path for tab kinds today — see PREREQUISITE / BLOCKER below.
- **D25** — Clicking a day FILTERS THE POPOUT LIST to that day. It does not open an entry. Calendar and popout SHARE filter state.
- **D29** — One dot PER ENTRY, capped. Cap value and overflow treatment are UNDECIDED (open item below).
- **D31** — Keyboard operation and screen-reader compatibility are must-haves. High contrast is OUT OF SCOPE (themes own it); use `--tn-*` tokens only.

The discovery gate is CLOSED for the decisions above. See the discovery story for the full rationale.

## PREREQUISITE / BLOCKER: Tab-kind contribution point does not exist

The built-in `TabKind` values (from `packages/core/src/layout/index.ts`) are:
`"editor" | "preview" | "settings" | "graph" | "browser"`

The tab contribution seam exists and is shipped (verified 2026-08-07). Register the calendar
kind on the `desktopTabRegistry` singleton exported from `apps/desktop/src/tabs/tabRegistry.ts`
with a `factory: (context: DesktopTabContext) => ReactNode`;
`apps/desktop/src/shell/TabContent.tsx` calls it before its built-in branches, so **no shell
edit is required**. `DesktopExtensionContext.tabs.register()` is the extension-facing route and
namespaces the kind. Open the tab with `openTab(kind, title)`
(`apps/desktop/src/shell/DesktopShell.tsx`).

`TabKind` is already an open union (`BuiltInTabKind | (string & {})`), so **no
`packages/core` change is required** to add a kind.

Two hard constraints: a contributed kind **must** bring a `factory`, or the tab falls through
to the Markdown editor branch and reports a missing document; and `DesktopTabContext` carries
only `rootPath` and `tabId`, so journal data comes from the journal service or
`DesktopExtensionContext.workspace` — do not widen the context without raising it as a
separate decision.

## Questions first — STOP gate (still open for this story)

The items below are **genuinely undecided**. Do not implement the affected surfaces until each is resolved and recorded.

1. **Dot cap value and overflow treatment:** What is the cap on dots per day cell? What is rendered when overflow occurs (e.g. "+N" label, truncated row, single aggregate dot)?
2. **Dots in week view:** Does the week view show dots per entry the same way as month view, or does it show a count/bar?
3. **Tab singleton and option persistence:** Is the calendar tab a singleton (only one can be open)? Do the options-strip selections (week vs month, active date) persist across tab closes?
4. **Calendar on a phone:** How does the canvas tab behave at phone widths? This is not resolved by D12/D26 (which apply to the popout, not the tab).
5. **Calendar grid keyboard model:** Roving-focus model, month paging keys, and activation semantics for day cells need their own accessibility pass. Do NOT guess — mark as a STOP gate.
6. **Day click when the popout is closed:** If the user clicks a day and the popout is not open, does it open? Does the filter still apply?
7. **Date filter as a dismissible chip:** Does the active day filter appear in the popout as a chip that the user can dismiss independently of the calendar tab?

**STOP gate:** The tab seam is available, so registration is unblocked. Do not implement the grid, dot rendering, day-selection behavior, or the keyboard model until each open item above has a product-owner decision recorded in the discovery story.

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
- `apps/desktop/src/tabs/tabRegistry.ts` — NOTE: extension is `.ts`, not `.tsx` — (register calendar tab-kind metadata; this alone does NOT make `TabContent.tsx` render it).
- `apps/desktop/src/shell/TabContent.tsx` — CRITICAL: must add a rendering branch for the new tab kind; without this change, the kind is registered but never rendered.
- `packages/core/src/layout/index.ts` — adding a new `TabKind` value requires a change here; keep platform-agnostic (no React, no Tauri).
- `apps/desktop/src/tabs/tabModel.ts` (minimal, only to produce a tab object for the new kind and register its open action).
- Shared filter-state interface between `JournalPanel` and `CalendarTab` — location TBD when popout-story contract is stable.

Do NOT touch `apps/desktop/src/shell/ActivityBar.tsx` for the calendar — no activity-bar entry.

## Dependencies

- **Prerequisite (blocking):** tab-kind contribution point story — `TabContent.tsx` and `packages/core/src/layout/index.ts` must be updated with a contribution mechanism before this story can proceed.
- Approved discovery desktop wireframe (closed for D14/D27/D25/D29); open items above must be resolved before grid implementation.
- Calendar data model/aggregation story (per-day aggregation logic is provisional; D8).
- `pending-journal_panel_ui-high-hard.md` must export a stable filter-state contract (shared filter state per D25).
- `--tn-*` design token set (no new tokens for this story).

## Acceptance criteria

- [ ] Calendar opens only from the journal popout "Open calendar" button into a canvas tab; no activity-bar entry or panel registration.
- [ ] The calendar kind is registered with a `factory`; `TabContent.tsx` is NOT edited. A registration without a factory is a defect.
- [ ] `packages/core` is unchanged — `TabKind` is already an open union, so adding a kind needs no core edit.
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
- Verify `TabContent.tsx` renders the new kind (not a blank or error state).
- Verify no hard-coded colors; inspect CSS for `--tn-*` token usage.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`). All calendar/view-model/tab-registry tests must pass. Typecheck must pass in both `apps/desktop` and `packages/core` after adding the new `TabKind` value.

## Manual desktop/mobile checks

Desktop: validate approved iterative mockups, range/filter/day states, dot rendering, options strip, keyboard grid model, and themes. Mobile: calendar tab behavior on a phone is an OPEN ITEM; do not implement phone-specific calendar layout until that decision is recorded.

## Non-goals

- No calendar activity-bar button or panel registration.
- No hard-coded mood/activity taxonomy, colors, or icons.
- No journal service rewrite, mobile refinement (blocked by open item), notifications, streaks, AI/sentiment inference, or extension-host registration.
- High contrast is out of scope (themes own it).
- Do not decide a final visualization or mood/activity palette in implementation.
- Do not register the tab kind as an extension contribution — until a contribution point exists, this is a shell change.

## Handoff artifacts

The following stories need from this one:

- Confirmed tab-kind registration location (`tabRegistry.ts` + `TabContent.tsx` + `packages/core/src/layout/index.ts`) and API (needed by `journal_extension_host_integration`).
- Stable filter-state interface (shared with journal popout) so `journal_panel_ui` and this story can consume the same state slice.
- Dot rendering component API (needed if calendar data model story adds per-day aggregation logic).
- Open items list (dot cap, keyboard model, phone behavior) forwarded to product owner for resolution before grid implementation begins.

## Platform note — the tab seam already exists

Verified against shipped code on 2026-08-07. **No prerequisite story is required.**

Register the calendar kind on the `desktopTabRegistry` singleton exported from
`apps/desktop/src/tabs/tabRegistry.ts`, supplying
`factory: (context: DesktopTabContext) => ReactNode`. `apps/desktop/src/shell/TabContent.tsx`
reads that same singleton and calls `view.factory({ rootPath, tabId })` before its built-in
branches, so **no shell edit is required**. As a built-in the journal may import the
singleton directly, or contribute through `DesktopExtensionContext.tabs.register()`, which
namespaces the kind — confirm the resulting kind string from `prefixId` before hard-coding it
anywhere. Open the tab with `openTab(kind, title)` (`apps/desktop/src/shell/DesktopShell.tsx`).
Registration returns a `Disposable`, and the registry exposes `subscribe()` so the shell
re-renders as kinds come and go.

Two constraints:

- **A contributed kind must bring a `factory`.** Without one the tab falls through to the
  Markdown editor branch and reports a missing document.
- **`DesktopTabContext` carries only `rootPath` and `tabId`.** Journal data comes from the
  journal service or `DesktopExtensionContext.workspace`; do not expect document state here,
  and do not widen the context without raising it as a separate decision. Built-in kinds stay
  shell-drawn precisely because the editor needs state this context does not carry.
