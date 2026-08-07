# Story: Journal Mobile Refinement

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). Mobile is a responsive build of `apps/desktop`, not a separate app.

## Discovery constraints (approved 2026-08-07)

Decisions from `../pending-journal_discovery_and_wireframes-low-med.md` that bind this story:

- **D12** / **D26** — On mobile the popout is FULL SCREEN. Popout placement and the return path are the APP SHELL's concern (bottom-nav subset + hamburger). The journal must NOT implement bespoke mobile navigation, a private bottom bar, or a custom return path.
- **D31** — Keyboard operation and screen-reader compatibility are must-haves. Formal touch-target audit is DEFERRED. High contrast is OUT OF SCOPE (themes own it); `--tn-*` tokens only.
- **D35** — Collapsed metadata renders as a DATELINE. On a phone the dateline must remain readable at narrow widths.
- **D40** — Mobile layout M-1: compact list density. M-2: BOTTOM SHEET for metadata editing. One list implementation shared with desktop; the sheet is confined to metadata editing only. **The bottom sheet is new component surface — this is a non-trivial cost item.**

The discovery gate is CLOSED for the decisions above.

## Questions first — STOP gate (still open for this story)

The items below are **genuinely undecided**. Do not implement the affected surfaces until each is resolved.

1. **Calendar tab on a phone:** How does the canvas tab calendar behave at phone widths? Not decided by D12/D26 (which apply only to the popout). Coordinate with `pending-calendar_tab_ui-high-hard.md`.
2. **Formal touch-target audit:** Deferred per D31. Once undeferred, this story or a follow-on must audit all interactive elements against the repository's minimum target size and document exceptions.
3. **Measured-column behavior at narrow widths:** At what popout width does the date/time/first-line row switch to a compact layout, and which columns are dropped or wrapped?

**STOP gate:** Do not implement the bottom sheet, narrow-width column changes, or calendar-on-phone layout until each open item above has a product-owner decision recorded.

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
- Calendar tab behavior on a phone (open item above).

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

## Tests / manual checks

- `MetadataBottomSheet.test.tsx`, `JournalPanel.mobile.test.tsx`, responsive component tests with narrow/wide viewport fixtures, lint/typecheck/full QA.
- Manual Android emulator and iOS simulator/device: open full-screen popout (via shell navigation), compact list density, open metadata bottom sheet, dismiss sheet, rotate if supported, invoke back via shell, recover from error.
- Confirm no `apps/mobile/` directory or bespoke bottom-nav code is created.
- Confirm calendar tab phone behavior is NOT addressed here (deferred to open item).

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`). Responsive component and accessibility tests must pass.

## Manual desktop/mobile checks

Desktop: verify approved desktop mockup remains unchanged at wide and narrow widths. Mobile: Android emulator and iOS simulator/device — keyboard, compact list scroll, bottom sheet open/close/focus, back/close, screen reader, and dateline readability. Broader shell navigation remains the mobile layout story's responsibility.

## Non-goals

- No bespoke mobile navigation, private bottom bar, custom return path, or `apps/mobile/` directory.
- No calendar tab phone layout (open item; coordinate with calendar story).
- No separate mobile app, React Native layer, cloud sync, tablet-specific design, or app-store work.
- No fix for unrelated CodeMirror/Tauri keyboard issues — link to `pending-codemirror_mobile_testing-low-med.md`.
- High contrast is out of scope (themes own it).

## Handoff artifacts

The following stories need from this one:

- `MetadataBottomSheet` component API and CSS Module for reuse if the metadata widget is extended in future slices.
- `mobile-a11y-checklist.md` for sign-off by the product owner and for reference by the calendar mobile open item.
- Confirmation (in test output) that the wide-desktop layout is unchanged, for the calendar tab story to rely on.
