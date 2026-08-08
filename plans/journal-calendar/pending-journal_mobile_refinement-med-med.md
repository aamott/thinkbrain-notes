# Story: Journal Mobile Refinement

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). Mobile is a responsive build of `apps/desktop`, not a separate app.

## Discovery constraints (approved 2026-08-07)

The discovery gate is CLOSED; full rationale and D1-D47 live in
`../pending-journal_discovery_and_wireframes-low-med.md`.

- **D12/D26:** the popout is full screen; shell owns placement/return navigation. No bespoke journal navigation, bottom bar, or return path.
- **D31:** keyboard and screen-reader support are required; high contrast is theme-owned; use `--tn-*` tokens; formal touch-target audit is deferred.
- **D35:** collapsed metadata is a readable dateline at narrow widths.
- **D40:** share one list with desktop using compact M-1 density; M-2 is a metadata-only bottom sheet and a new component surface.

**Inherited blocker:** M-2 is metadata editing and inherits the metadata-widget
implementation route chosen by D44 in `pending-journal_panel_ui-high-hard.md` (React
editor-header contribution slot). The prerequisite D44 platform implementation is still
pending, so the sheet cannot be built until that route ships.

The discovery gate is CLOSED for the decisions above.

## Questions first — STOP gate — CLOSED 2026-08-08 (D57, D55)

Rationale and rejected alternatives: `docs/superpowers/specs/2026-08-08-journal-open-decisions-proposal.md`.

1. **Calendar tab on a phone — closed by D57.** Both week and month views are
   available at phone widths. The view-options control strip collapses to a single
   segmented control. Day cells render dots only: the `+N` remainder text is
   dropped below a 40px cell width (per D46's density model), while the exact
   matching count remains present in the accessible name regardless. This is a
   layout threshold, not the touch-target audit — see item 2, which stays
   deferred.
2. **Formal touch-target audit — still deferred per D31.** Not closed by this
   batch. Once undeferred, this story or a follow-on must audit all interactive
   elements against the repository's minimum target size and document exceptions.
3. **Measured-column behavior at narrow widths — closed by D55, owned by
   `pending-journal_panel_ui-high-hard.md`.** This story consumes, and must not
   define a second breakpoint. The measured row responds to the popout's own
   width, not the viewport, at two breakpoints: at 320px and above it shows date,
   time, and first line; below 320px the time joins the date line and the first
   line wraps beneath; below 260px the first-line preview is dropped entirely.

**STOP gate: CLOSED for items 1 and 3.** The calendar-on-phone layout (D57) and the
narrow-width measured column (D55, consumed from the panel story) may now be
implemented. Item 2, the formal touch-target audit, remains deferred by D31 and
blocks nothing else in this story — treat all other touch targets as informal
until that audit lands.

## Scope (narrowed)

This story owns ONLY journal-specific mobile concerns:

- Popout full screen at phone widths (D12) — wired through the app shell's responsive contract, not a bespoke override.
- Compact list density (M-1 per D40).
- Bottom sheet for metadata editing (M-2 per D40) — new component surface, cost must be estimated before scheduling.
- Touch targets for journal-owned controls (formal audit deferred per D31).
- Collapsed dateline readability at narrow widths (D35).

This story does NOT own:

- Popout placement, return path, bottom-nav subset, or hamburger — those belong to `plans/mobile/pending-responsive_layout-low-med.md`. Coordinate; do not duplicate.
- Bespoke mobile navigation, a private bottom bar, or a custom back gesture (D26).
- Calendar tab behavior on a phone (D57).

## Goal

Refine journal-owned surfaces for phone-sized viewports using the existing responsive shell and shared service/adapter contracts: full-screen popout (shell-driven), M-1 compact list density, M-2 bottom sheet for metadata editing, and dateline readability at narrow widths.

## Likely files

- `apps/desktop/src/journal/JournalPanel.module.css` (responsive refinements for compact list density and narrow dateline).
- `apps/desktop/src/journal/JournalPanel.tsx` (only semantic/interaction changes required by D40; no mobile-only screen tree).
- `apps/desktop/src/journal/MetadataBottomSheet.tsx` (new; M-2 bottom sheet confined to metadata editing).
- `apps/desktop/src/journal/MetadataBottomSheet.module.css` (new; CSS Modules, `--tn-*` tokens only).
- `apps/desktop/src/journal/MetadataBottomSheet.test.tsx` (new).
- `apps/desktop/src/journal/JournalPanel.mobile.test.tsx` (new or colocated viewport tests).
- `apps/desktop/src/shell/DesktopShell.tsx`, `panels/LeftPopout.tsx` (reuse existing responsive full-screen behavior; avoid separate screen tree — coordinate with `pending-responsive_layout-low-med.md` owner).
- `apps/desktop/src/journal/mobile-a11y-checklist.md` (new manual matrix for VoiceOver/TalkBack).

Do NOT create `apps/mobile/` or add a separate mobile screen tree.

## Dependencies

- `plans/mobile/pending-responsive_layout-low-med.md` — owns popout placement and return path. This story must coordinate but not duplicate.
- Completed `pending-journal_panel_ui-high-hard.md` (JournalPanel, MetadataWidget, compact-list state).
- Same `apps/desktop` adapters and `packages/core` models; no Tauri direct calls — go through `apps/desktop/src/native/` adapters.

## Acceptance criteria

- [ ] At phone widths, the journal popout renders full-screen; placement and return path are provided by the app shell (D12/D26); no bespoke journal navigation code.
- [ ] Compact list density (M-1) applies at phone widths without changing the wide desktop layout; one list implementation is shared.
- [ ] Metadata editing at phone widths uses a bottom sheet (M-2, D40); the sheet is confined to metadata editing; it does not replace the full-screen popout or override shell navigation.
- [ ] Bottom sheet appears and dismisses correctly; focus is trapped while open and restored on close; screen-reader announcements are correct.
- [ ] Collapsed dateline is readable at narrow widths; no overflow or truncation without accessible alternatives.
- [ ] Existing wide-screen tests and shell behavior remain unchanged; QA passes.
- [ ] No bespoke bottom nav, private return path, or `apps/mobile/` code is introduced.
- [ ] `mobile-a11y-checklist.md` covers VoiceOver/TalkBack labels, zoom/text scaling, and soft-keyboard/viewport interactions for journal-owned surfaces.

## Validation

- Automated: `MetadataBottomSheet.test.tsx`, `JournalPanel.mobile.test.tsx`, responsive narrow/wide viewport tests, and `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`); responsive and accessibility tests must pass.
- Desktop: verify the approved mockup remains unchanged at wide and narrow widths. Mobile Android/iOS: open the shell-provided full-screen popout; verify compact density/scrolling, bottom-sheet open/dismiss/focus trap, keyboard/viewport interactions, screen-reader behavior, dateline readability, rotation if supported, shell back/close, and error recovery.
- Confirm no `apps/mobile/` directory, bespoke bottom-nav code, or calendar-tab phone behavior is added; broader shell navigation remains the mobile layout story's responsibility.

## Non-goals

- No bespoke mobile navigation, private bottom bar, custom return path, or `apps/mobile/` directory.
- No calendar tab phone layout beyond D57; `pending-calendar_tab_ui-high-hard.md` implements it.
- No separate mobile app, React Native layer, cloud sync, tablet-specific design, or app-store work.
- No fix for unrelated CodeMirror/Tauri keyboard issues — link to `pending-codemirror_mobile_testing-low-med.md`.
- High contrast is out of scope (themes own it).

## Handoff artifacts

The following stories need from this one:

- `MetadataBottomSheet` component API and CSS Module for reuse if the metadata widget is extended in future slices.
- `mobile-a11y-checklist.md` for sign-off by the product owner and for reference by the calendar tab story.
- Confirmation (in test output) that the wide-desktop layout is unchanged, for the calendar tab story to rely on.
