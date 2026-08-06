# Settings Highlight Bus Robustness

## Goal

Make the cross-component settings highlight bus resilient: one broken subscriber
must not prevent sibling notifications, module hot reload must not strand stale state,
and the short-lived highlight must not leak confusing state across remounts.

## Files

- `apps/desktop/src/settings/settingHighlight.ts` — isolate listener failures with
  `try/catch` plus `console.error`, including the timeout clear path; add Vite HMR
  disposal for subscribers, timer, and current highlight. Preserve the existing
  request/clear timing and unsubscribe API unless tests show a leak.
- Add `apps/desktop/src/settings/settingHighlight.test.ts` with fake timers and
  listener-failure/HMR regression coverage.

## Reproduction / verification

- Subscribe two listeners and make the first throw during `requestSettingHighlight`
  or timeout clearing; currently the second listener is never called.
- Re-evaluate the module under Vite HMR while a subscriber/timer is active; currently
  the old subscriber set and timer can become disconnected from the newly evaluated
  module.
- Run the focused bus tests, `pnpm typecheck`, and `pnpm lint`; exercise the search
  navigation manual check below.

## Acceptance criteria

- [ ] A throwing subscriber is logged and skipped; all other subscribers receive both
      highlight and clear notifications.
- [ ] HMR disposal clears subscribers, pending timeout, and current highlight without
      throwing or retaining stale callbacks.
- [ ] Repeated requests still cancel the prior timer and keep the latest highlight for
      the existing duration.
- [ ] Subscribe/unsubscribe behavior remains idempotent and the public API is unchanged.

## Manual checks

- Search for a setting below the fold, click its result, and confirm the target row
  highlights and clears normally after the existing short duration.
- In dev mode, edit/reload the highlight module and confirm search highlighting resumes
  after remount without duplicate callbacks or stale rings.

## Automated tests

- Fake-timer tests for immediate notification, clear notification, timer replacement,
  unsubscribe, and subscriber exception isolation.
- A Vite-HMR dispose test/fixture where the environment supports `import.meta.hot`.

## Non-goals

- Do not change the settings search ranking, highlight duration, or visual styling.
- Do not move highlight state into the Zustand settings store.
- Do not redesign SettingsContent scrolling; the scroll-to-row behavior is already
  implemented and verified separately.
