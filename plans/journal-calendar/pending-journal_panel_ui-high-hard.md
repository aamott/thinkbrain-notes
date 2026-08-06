# Story: Journal Panel UI

**Status:** pending · **Urgency:** high · **Difficulty:** hard

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Questions first

- What does the journal panel prioritize: today, recent entries, search/filter, or creation?
- Which actions open the existing editor tab versus render inline, and how are dirty/unsaved states communicated?
- Which empty, loading, malformed, no-workspace, and I/O-error states need distinct copy and recovery actions?
- How are mood/activity values entered or displayed without implying a health assessment?
- Which panel width, resizability, and mobile collapse behavior did the approved wireframe choose?

**STOP gate:** Do not implement JSX/CSS, choose icons/colors, or wire activity-bar actions until the product owner approves the journal wireframe, state matrix, copy, and keyboard/focus behavior. Require iterative approval of discovery alternative, desktop wireframe, desktop mockup, mobile mockup, and each implementation increment; record the approved version before proceeding. The existing shell pattern is an integration boundary, not a final UX decision.

## Goal

Implement the approved journal list/create/open experience as a focused React surface using real service data and existing editor-tab/workspace boundaries.

## Likely files

- `apps/desktop/src/journal/JournalPanel.tsx` (new).
- `apps/desktop/src/journal/JournalPanel.module.css` (new; CSS Modules and `--tn-*` tokens).
- `apps/desktop/src/journal/JournalPanel.test.tsx` (new).
- `apps/desktop/src/journal/journalViewModel.ts` and test (new, if state mapping merits separation).
- `apps/desktop/src/panels/panelRegistry.tsx` (register/consume approved panel contribution; do not bypass registry).
- `apps/desktop/src/panels/LeftPopout.tsx`, `apps/desktop/src/shell/ActivityBar.tsx`, `apps/desktop/src/shell/DesktopShell.tsx` (only minimal context/callback wiring, if required).
- `apps/desktop/src/tabs/tabModel.ts` / `TabContent.tsx` (only to open the existing editor contract; do not fork editor state).

## Dependencies

- Approved discovery desktop wireframe and state/copy matrix.
- Journal data model, journal service, settings/accessibility contract.
- Existing `DesktopPanelContribution`, `DesktopPanelContext`, `LeftPopout`, `ActivityBar`, and editor tab reducer.

## Acceptance criteria

- [ ] Journal is registered through the existing desktop panel registry with a stable, approved contribution id and left-side placement.
- [ ] Panel uses injected/mockable journal service data and opens existing Markdown editor tabs rather than duplicating document state.
- [ ] Create/open/list/loading/error/empty/malformed/no-workspace states match the approved state matrix; no fake data ships.
- [ ] Approved template/date/mood/activity controls expose validation and preserve unsaved work according to the existing save contract.
- [ ] Keyboard focus order, escape behavior, accessible names/roles, live status, visible focus, and touch targets are tested.
- [ ] CSS uses co-located modules/shared tokens, respects theme and reduced-motion preferences, and does not use JSX inline styles.
- [ ] Desktop tests cover rendering, service failures, opening/creating notes, dirty-state behavior, and panel toggling.

## Tests / manual checks

- `JournalPanel.test.tsx`, relevant panel-registry tests, lint/typecheck/full QA.
- Manual desktop: open/close activity-bar entry, create today/past note, open an existing note with unsaved edits, resize the popout, switch theme, keyboard-only navigation, screen reader labels, and error recovery.
- Verify real Markdown files are created in the approved location and remain readable outside the app.

## Automated validation

Run panel/view-model/registry tests plus `pnpm lint`, `pnpm typecheck`, and `pnpm test` or `./scripts/qa.sh`.

## Manual desktop/mobile checks

Desktop: validate approved iterative mockups, real create/open/dirty/error flows, keyboard/screen reader, and themes. Mobile: validate the approved mobile mockup, touch/keyboard/rotation/VoiceOver-TalkBack behavior; broader refinement remains the mobile child.

## Non-goals

- No calendar view, mobile-specific redesign, background indexing, reminders, AI assistance, or extension-host lifecycle code.
- Do not invent the final mood/activity taxonomy, visual encoding, or navigation labels.
