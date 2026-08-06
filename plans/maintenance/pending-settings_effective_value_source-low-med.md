# Settings Effective-Value Source

## Goal

Remove the duplicate effective-value algorithm from `SettingsContent` so rendered
controls and non-React consumers cannot drift when settings precedence changes. Keep
reactive rendering by continuing to subscribe to the raw store maps.

## Files

- `apps/desktop/src/settings/settingsStore.ts` — extract/export one pure
  `resolveEffectiveValue` helper (or equivalent store-level implementation) for
  staged > app > workspace > definition default resolution; have
  `getEffectiveValue` use it.
- `apps/desktop/src/settings/SettingsContent.tsx` — remove the duplicate
  `computeEffectiveValue` implementation and call the shared resolver using the
  already-selected raw maps. Keep the existing subscriptions so map changes trigger
  render.
- `apps/desktop/src/settings/settingsStore.test.ts` — table-test precedence and
  missing/default behavior through the shared helper and store action.
- Add/extend `apps/desktop/src/settings/SettingsContent.test.tsx` if needed to verify
  a staged/app/workspace/default value is rendered by a control.

## Reproduction / verification

- Compare `SettingsContent.computeEffectiveValue` with
  `settingsStore.getEffectiveValue`: both currently use the same precedence, but the
  component owns a second implementation and passes `definition.default` directly
  while the store action resolves the registered definition.
- Change the shared precedence in a test fixture and verify both the store action and
  rendered control follow the same result.
- Run focused settings tests, `pnpm typecheck`, and `pnpm lint`.

## Acceptance criteria

- [ ] Exactly one production implementation defines effective-value precedence.
- [ ] `SettingsContent` remains reactive to staged, app, and workspace map changes.
- [ ] The store action and rendered controls return the same value for registered keys,
      including defaults and falsy values (`false`, `0`, and empty string).
- [ ] Existing settings UI behavior and diagnostics remain unchanged.

## Manual checks

- Open a setting with a saved value, stage a new value, reset it, and verify the
  control follows staged > saved app/workspace > default at each step.
- Check boolean `false`, numeric `0`, and empty-string values are not replaced by a
  lower-precedence value.

## Automated tests

- Unit table tests for each precedence layer, falsy values, and missing definitions.
- Settings content rendering test that changes staged state and observes the control
  update without remounting.

## Non-goals

- Do not change settings precedence, persistence, migration, or validation policy.
- Do not change the settings UI layout or controls.
- Do not combine this refactor with highlight-bus robustness work.
