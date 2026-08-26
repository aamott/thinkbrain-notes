# Story: Journal Mobile Refinement

**Status:** 🟨 in progress — M-2 metadata sheet (D78), M-1 touch density (D76) and the a11y
checklist shipped 2026-08-08. Remaining: the manual VoiceOver/TalkBack pass on real devices,
which is the checklist's whole point and cannot be run here.

**Urgency:** med · **Difficulty:** med

## How the phone treatments are chosen

Touch, not width (D76). A full-screen popout is about 390px across and so is a wide desktop
panel, so a width query cannot tell a thumb from a mouse. Visual-only treatments use the
`pointer-coarse:` utility; `useCoarsePointer()` exists for the one case where the DOM itself
differs — the sheet standing in for the inline editor.

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). Mobile is a responsive build of `apps/desktop`, not a separate app.

## Discovery constraints (approved 2026-08-07)

The discovery gate is CLOSED; full rationale and D1-D47 live in
`../pending-journal_discovery_and_wireframes-low-med.md`.

- **D12/D26:** the popout is full screen; shell owns placement/return navigation. No bespoke journal navigation, bottom bar, or return path.
- **D31:** keyboard and screen-reader support are required; high contrast is theme-owned; use `--tn-*` tokens; formal touch-target audit is deferred.
- **D35:** collapsed metadata is a readable dateline at narrow widths.
- **D40/D76:** share one list with desktop; phone rows use the two-line form at a 44px minimum. M-2 is a metadata-only bottom sheet and the journal's only new component.

**Mobile mockup APPROVED 2026-08-08** — `assets/journal-panel-mobile-mockup.html`, closing
D76 (touch decides phone row height), D77 (chips wrap) and D78 (the sheet's contract).

M-2 inherits the metadata-widget route chosen by D44; that slot shipped 2026-08-08
(`apps/desktop/src/tabs/editorHeaderRegistry.tsx`), so the sheet is no longer blocked.

The discovery gate is CLOSED for the decisions above.

## Questions first — STOP gate — CLOSED 2026-08-08 (D57, D55)

Closed by D48-D70; full text in `../pending-journal_discovery_and_wireframes-low-med.md`.

- **Calendar tab on a phone — D57.** Both views at phone widths; option strip collapses to one control; dots only, no `+N`, below 40px cells.
- **Formal touch-target audit — still DEFERRED per D31.** Not closed by this batch; owed once undeferred.
- **Measured-column behavior at narrow widths — D55, amended by D72 (owned by panel_ui story).** This story consumes; must not define a second breakpoint. The first-line preview is never dropped, at any width.

Items 1 and 3 (D57, D55) are closed and may be implemented; item 2 (D31 audit) stays deferred and blocks nothing else here.

## Scope (narrowed)

This story owns ONLY journal-specific mobile concerns:

- Popout full screen at phone widths (D12) — wired through the app shell's responsive contract, not a bespoke override.
- Compact list density (M-1 per D40).
- Bottom sheet for metadata editing (M-2 per D40) — new component surface, cost must be estimated before scheduling.
- Touch targets for journal-owned controls (formal audit deferred per D31).
- Collapsed dateline readability at narrow widths (D35).

This story does NOT own:

- Popout placement, return path, bottom-nav subset, or hamburger — those belong to `plans/mobile/pending-responsive_layout-med-med.md`. Coordinate; do not duplicate.
- Bespoke mobile navigation, a private bottom bar, or a custom back gesture (D26).
- Calendar tab behavior on a phone (D57) — shipped 2026-08-08 in `CalendarTab.tsx` via
  container queries; do not re-implement it here.

## Goal

Refine journal-owned surfaces for phone-sized viewports using the existing responsive shell and shared service/adapter contracts: full-screen popout (shell-driven), M-1 compact list density, M-2 bottom sheet for metadata editing, and dateline readability at narrow widths.

## Likely files

- `apps/desktop/src/journal/JournalPanel.tsx` (responsive refinements for compact list density and narrow dateline; only semantic/interaction changes required by D40; no mobile-only screen tree).
- `apps/desktop/src/journal/MetadataBottomSheet.tsx` (new; M-2 bottom sheet confined to metadata editing).
- `apps/desktop/src/journal/MetadataBottomSheet.test.tsx` (new).
- `apps/desktop/src/journal/JournalPanel.mobile.test.tsx` (new or colocated viewport tests).
- `apps/desktop/src/shell/DesktopShell.tsx`, `panels/LeftPopout.tsx` (reuse existing responsive full-screen behavior; avoid separate screen tree — coordinate with `pending-responsive_layout-med-med.md` owner).
- `apps/desktop/src/journal/mobile-a11y-checklist.md` (new manual matrix for VoiceOver/TalkBack).

Do NOT create `apps/mobile/` or add a separate mobile screen tree.

## Dependencies

- `plans/mobile/pending-responsive_layout-med-med.md` — owns popout placement and return path. This story must coordinate but not duplicate.
- Completed `pending-journal_panel_ui-high-hard.md` (JournalPanel, MetadataWidget, compact-list state).
- Same `apps/desktop` adapters and `packages/core` models; no Tauri direct calls — go through `apps/desktop/src/native/` adapters.

## Acceptance criteria

- [ ] At phone widths, the journal popout renders full-screen; placement and return path are provided by the app shell (D12/D26); no bespoke journal navigation code. — untouched here; the shell already owns it.
- [x] Compact list density (M-1) applies at phone widths without changing the wide desktop layout; one list implementation is shared. — `pointer-coarse:min-h-11` in `JournalPanel.tsx`; the mouse layout is unchanged and a test walks every control.
- [x] Metadata editing at phone widths uses a bottom sheet (M-2, D40); the sheet is confined to metadata editing; it does not replace the full-screen popout or override shell navigation. — `MetadataBottomSheet.tsx`, reached only through the dateline.
- [x] Bottom sheet appears and dismisses correctly; focus is trapped while open and restored on close; screen-reader announcements are correct. — all four D78 behaviours covered; the announcements themselves still need the manual pass.
- [x] Collapsed dateline is readable at narrow widths; no overflow or truncation without accessible alternatives. — the dateline wraps; nothing is truncated.
- [x] Existing wide-screen tests and shell behavior remain unchanged; QA passes. — 663 desktop tests, lint 0 errors, typecheck clean.
- [x] No bespoke bottom nav, private return path, or `apps/mobile/` code is introduced.
- [x] `mobile-a11y-checklist.md` covers VoiceOver/TalkBack labels, zoom/text scaling, and soft-keyboard/viewport interactions for journal-owned surfaces. — `apps/desktop/src/journal/mobile-a11y-checklist.md`; **unrun**, it needs real devices.

## Validation

- Automated: `MetadataBottomSheet.test.tsx`, `JournalPanel.mobile.test.tsx`, responsive narrow/wide viewport tests, and `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`); responsive and accessibility tests must pass.
- Desktop: verify the approved mockup remains unchanged at wide and narrow widths. Mobile Android/iOS: open the shell-provided full-screen popout; verify compact density/scrolling, bottom-sheet open/dismiss/focus trap, keyboard/viewport interactions, screen-reader behavior, dateline readability, rotation if supported, shell back/close, and error recovery.
- Confirm no `apps/mobile/` directory, bespoke bottom-nav code, or calendar-tab phone behavior is added; broader shell navigation remains the mobile layout story's responsibility.

## Non-goals

- No bespoke mobile navigation, private bottom bar, custom return path, or `apps/mobile/` directory.
- No calendar tab phone layout beyond D57; `pending-calendar_tab_ui-high-hard.md` implements it.
- No separate mobile app, React Native layer, cloud sync, tablet-specific design, or app-store work.
- No fix for unrelated CodeMirror/Tauri keyboard issues — link to `done-codemirror_mobile_testing-med-med.md`.
- High contrast is out of scope (themes own it).

## Handoff artifacts

The following stories need from this one:

- `MetadataBottomSheet` component API for reuse if the metadata widget is extended in future slices.
- `mobile-a11y-checklist.md` for sign-off by the product owner and for reference by the calendar tab story.
- Confirmation (in test output) that the wide-desktop layout is unchanged, for the calendar tab story to rely on.
