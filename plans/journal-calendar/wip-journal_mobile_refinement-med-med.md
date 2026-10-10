# Story: Journal Mobile Refinement

**Status:** 🟨 in progress · **Urgency:** med · **Difficulty:** med

Shipped: M-2 metadata sheet (D78, `MetadataBottomSheet.tsx`), M-1 touch
density (D76, `pointer-coarse:` in `JournalPanel.tsx`), and
`mobile-a11y-checklist.md`. An Android emulator structural/gesture pass fixed
system-Back dismissal, modal isolation, active-filter naming, preview naming,
and touch targets. Remaining: human-audited TalkBack on physical Android and
VoiceOver on iOS.

Part of [Journal & Calendar](journal-calendar). Mobile is a responsive build
of `apps/desktop`, not a separate app. Mobile mockup APPROVED —
`assets/journal-panel-mobile-mockup.html` (D76/D77/D78).

## Key decisions

- Touch, not width (D76): a full-screen popout is ~390px like a wide desktop
  panel, so `pointer-coarse:` utilities drive treatments;
  `useCoarsePointer()` covers the one DOM-level difference (the sheet).
- D12/D26: the popout is full screen; the shell owns placement/return — no
  bespoke journal navigation, bottom bar, or back gesture.
- D35/D40/D76: one shared list; phone rows use the two-line form at a 44px
  minimum; M-2 is a metadata-only bottom sheet reached through the dateline.
- D55/D72 (owned by `journal_panel_ui`): narrow-width column behavior is
  consumed here, never redefined; the preview is never dropped.
- D57 calendar phone layout shipped in `CalendarTab.tsx` — do not
  re-implement. Formal touch-target audit remains deferred (D31).

## Acceptance criteria

- [ ] At phone widths the popout renders full-screen via the shell
      (D12/D26); no bespoke journal navigation. — shell-owned; verify once.
- [x] Compact list density (M-1) applies at phone widths without changing
      the desktop layout; one shared list implementation.
- [x] Metadata editing at phone widths uses the M-2 bottom sheet (D40);
      confined to metadata editing; does not replace the popout.
- [x] Sheet opens/dismisses correctly; focus trapped while open, restored on
      close; announcements correct (manual audio pass still owed).
- [x] Collapsed dateline readable at narrow widths; nothing truncated.
- [x] Wide-screen tests and shell behavior unchanged; QA green.
- [x] No bespoke bottom nav, private return path, or `apps/mobile/` code.
- [x] `mobile-a11y-checklist.md` covers VoiceOver/TalkBack labels, zoom/text
      scaling, and soft-keyboard/viewport interactions.
- [ ] **Human screen-reader pass**: TalkBack on physical Android hardware and
      VoiceOver on iOS, per `mobile-a11y-checklist.md`.

## Non-goals

No bespoke mobile navigation/bottom bar/return path, no `apps/mobile/`
directory, no calendar phone layout beyond D57, no tablet design, no
CodeMirror/Tauri keyboard fixes (see `codemirror_mobile_testing`). High
contrast is theme-owned.
