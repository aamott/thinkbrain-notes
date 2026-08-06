# Story: Journal & Calendar Mobile Refinement

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). Mobile is a responsive build of `apps/desktop`, not a separate app.

## Questions first

- Which journal/calendar actions must be reachable in one hand and which may move behind a secondary control?
- Does the approved mobile flow use bottom tabs, a single panel overlay, or another existing shell pattern?
- How should the soft keyboard, viewport resize, orientation, back gesture, and unsaved editor state behave?
- Which dense calendar metadata is omitted, summarized, or expanded on a phone?
- What minimum touch target, focus, screen-reader, and reduced-motion behavior is required on Android and iOS?

**STOP gate:** Do not add mobile-only markup, breakpoint rules, gesture behavior, or platform conditionals until the owner approves the mobile wireframe and the desktop/mobile state mapping. Require iterative desktop mockup → mobile mockup → implementation approval, with each version recorded. Reflow the approved UX; do not invent feature parity or a second navigation system.

## Goal

Refine the approved journal and calendar panels for phone-sized viewports using the existing responsive shell, shared tokens, and same service/adapter contracts.

## Likely files

- `apps/desktop/src/journal/JournalPanel.module.css`, `CalendarPanel.module.css` (responsive refinements).
- `apps/desktop/src/journal/JournalPanel.tsx`, `CalendarPanel.tsx` (only semantic/interaction changes required by approved mobile design).
- `apps/desktop/src/shell/DesktopShell.tsx`, `ActivityBar.tsx`, `panels/LeftPopout.tsx` (reuse existing responsive shell; avoid separate screen tree).
- `apps/desktop/src/journal/JournalPanel.mobile.test.tsx`, `CalendarPanel.mobile.test.tsx` (new or colocated viewport tests).
- `apps/desktop/src/journal/mobile-a11y-checklist.md` (new manual matrix).
- `apps/desktop/src-tauri/tauri.android.conf.json`, `tauri.ios.conf.json` (do not edit unless a separate mobile config dependency requires it).

## Dependencies

- Approved mobile wireframe; completed journal/calendar panel stories and accessibility contract.
- `plans/mobile/pending-responsive_layout-low-med.md`, `pending-mobile_tauri_config-low-easy.md`, and `pending-codemirror_mobile_testing-low-med.md`.
- Same `apps/desktop` adapters and `packages/core` models; no `apps/mobile/` directory.

## Acceptance criteria

- [ ] Approved mobile layout works at representative phone widths without changing the wide desktop layout.
- [ ] Touch targets meet the repository/mobile target (at least 44px where applicable), with no hover-only action.
- [ ] Journal create/open and calendar navigation/filter flows remain usable with the soft keyboard and visual viewport changes.
- [ ] Back/close/focus restoration and dirty-note behavior are explicit and tested.
- [ ] Android and iOS differences are documented as observed, not guessed; unsupported desktop-only capability is not introduced.
- [ ] Accessibility checks cover keyboard/switch access where available, VoiceOver/TalkBack labels, zoom/text scaling, contrast, and reduced motion.
- [ ] Existing wide-screen tests and shell behavior remain unchanged; QA passes.

## Tests / manual checks

- Responsive component tests with narrow/wide viewport fixtures plus lint/typecheck/full QA.
- Manual Android emulator and iOS simulator/device check: open panel, create/open note, use keyboard, scroll calendar, select metadata, rotate if supported, invoke back, and recover from an error.
- Manual check that no mobile-only adapter or `apps/mobile/` code is created.

## Automated validation

Run responsive component/accessibility tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test` or `./scripts/qa.sh`.

## Manual desktop/mobile checks

Desktop: verify approved desktop mockup remains unchanged at wide and narrow widths. Mobile: use Android emulator and iOS simulator/device for keyboard, scroll, back/close, rotation, screen reader, errors, and suspension against the approved iterative mockups.

## Non-goals

- No separate mobile app, React Native layer, cloud sync, tablet-specific design, app-store work, or feature parity beyond the approved phone workflow.
- Do not fix unrelated CodeMirror/Tauri keyboard issues here; link them to the mobile testing story.
