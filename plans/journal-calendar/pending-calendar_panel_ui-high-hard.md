# Story: Calendar Panel UI

**Status:** pending · **Urgency:** high · **Difficulty:** hard

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Questions first

- Which calendar range/navigation model is approved for the first release?
- What should a day cell communicate when it has an entry, multiple entries, mood/activity metadata, invalid data, or no data?
- Are filters visible by default, and how should active filters be announced and cleared?
- What action occurs on day selection: open one note, show a list, create a note, or ask a question?
- Which visual encodings are optional supplements to text, and which must remain understandable without color or hover?

**STOP gate:** Do not implement a grid/list, select colors/icons, or decide selection/filter interactions until the owner approves the calendar wireframe, data-state matrix, and accessibility wording. Require iterative approval of discovery alternative, desktop wireframe, desktop mockup, mobile mockup, and each implementation increment; record the approved version before proceeding. Do not use the data model as an implicit UX decision.

## Goal

Implement the approved calendar navigation/aggregation surface with real journal data, explicit loading/error/empty states, and links to the existing editor/journal panel flow.

## Likely files

- `apps/desktop/src/journal/CalendarPanel.tsx` (new).
- `apps/desktop/src/journal/CalendarPanel.module.css` (new; CSS Modules/shared tokens).
- `apps/desktop/src/journal/CalendarPanel.test.tsx` (new).
- `apps/desktop/src/journal/calendarViewModel.ts` and test (new, if state/query mapping merits separation).
- `apps/desktop/src/panels/panelRegistry.tsx` (register/consume approved panel contribution).
- `apps/desktop/src/panels/LeftPopout.tsx`, `apps/desktop/src/shell/ActivityBar.tsx`, `apps/desktop/src/shell/DesktopShell.tsx` (minimal shell/context wiring only).

## Dependencies

- Approved discovery desktop wireframe and copy/state matrix.
- Calendar data model/aggregation, journal service, settings/accessibility contract.
- Existing panel registry/popout/activity-bar and editor-tab open behavior.

## Acceptance criteria

- [ ] Calendar is registered through the existing panel registry with a stable, approved contribution id and left-side placement.
- [ ] It renders the approved date range and filters from injected calendar data; no mock calendar data or hidden database dependency.
- [ ] Day states, metadata summaries, invalid values, no workspace, empty range, loading, and errors are explicit and actionable.
- [ ] Selecting a day follows the approved open/create/list behavior and preserves dirty editor state.
- [ ] Visual metadata has text alternatives, does not rely on color/hover, and does not make health/sentiment claims.
- [ ] Keyboard navigation, focus restoration, screen-reader announcements, reduced motion, and touch targets are tested.
- [ ] CSS modules/shared tokens and existing shell resize/overlay conventions are respected.

## Tests / manual checks

- Calendar panel, panel-registry, and view-model tests; run lint/typecheck/full QA.
- Manual: navigate month/range boundaries, toggle each approved filter, select no-entry/one-entry/multiple-entry/invalid days, open an editor with unsaved changes, use keyboard and screen reader, switch themes, and test narrow desktop width.

## Automated validation

Run calendar panel/view-model/registry tests plus `pnpm lint`, `pnpm typecheck`, and `pnpm test` or `./scripts/qa.sh`.

## Manual desktop/mobile checks

Desktop: validate approved iterative mockups, range/filter/day states, dirty editor preservation, keyboard/screen reader, and themes. Mobile: validate the approved mobile mockup at phone widths with touch, keyboard, rotation, and VoiceOver-TalkBack; broader refinement remains the mobile child.

## Non-goals

- No journal service rewrite, mobile refinement, notifications, streaks, AI/sentiment inference, or extension-host registration.
- Do not decide a final visualization or mood/activity palette in implementation.
