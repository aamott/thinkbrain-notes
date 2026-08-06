# Story: Journal Settings & Accessibility Contract

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Questions first

- Which settings belong at app scope versus workspace scope, and which should be portable across machines?
- Which folder, filename, date/time, template, mood/activity, and calendar options must be configurable in the first release?
- Should users edit vocabularies in settings, in templates, or only in note frontmatter?
- Which accessibility preferences or behaviors are required beyond shared theme tokens (reduced motion, density, contrast, labels, announcements)?
- How should invalid settings be explained, staged, reset, and recovered without corrupting notes?

**STOP gate:** Do not register a final settings schema or build controls until the owner approves the setting list, scope, defaults, validation/error behavior, and accessibility checklist. Require iterative desktop and mobile mockup approval before controls and record each checkpoint. Do not turn wireframe placeholders into setting names automatically.

## Likely files

- `packages/core/src/settings/modules/journal.ts` (new workspace-scoped module/schema; exact keys wait for approval).
- `packages/core/src/settings/modules/index.ts` and `packages/core/src/settings/index.ts` (exports/registration).
- `apps/desktop/src/settings/settingsStore.ts` (register module and preserve staged/save/reset semantics).
- `apps/desktop/src/settings/SettingsContent.tsx`, `SettingsNav.tsx`, `controls/` (render approved controls; existing files may be pending in the modular settings epic).
- `apps/desktop/src/journal/journalSettings.ts` (new typed selector/validation adapter, if UI should not import registry details).
- `apps/desktop/src/journal/journalSettings.test.ts`, `packages/core/src/settings/modules/journal.test.ts` (new).
- `apps/desktop/src/journal/accessibility.md` (new implementation checklist and manual matrix).

## Dependencies

- Discovery approval, data model, and modular settings stories (`plans/ui-shell/pending-modular_settings_system-med-hard.md` and child stories).
- Existing `appSettingsRegistry`, `useSettingsStore`, extension-scoped settings bridge, and CSS `--tn-*` tokens.
- Approved desktop/mobile wireframes for focus and responsive behavior.

## Acceptance criteria

- [ ] Approved settings are explicitly marked app/workspace scope and stored outside the workspace where required; journal folder content remains vault data.
- [ ] Defaults and validators reject unsafe paths, invalid templates, unsupported date/time values, and malformed metadata configuration with actionable diagnostics.
- [ ] Settings changes stage, validate, save, reset, and show dirty state using the existing settings contract.
- [ ] UI controls have labels, descriptions, errors, keyboard order, visible focus, and no color-only meaning; screen-reader status changes are specified.
- [ ] Journal/calendar metadata displays provide text alternatives and distinguish unknown/missing/invalid values without health claims.
- [ ] Tests cover schema registration, defaults, validation, persistence boundaries, dirty/reset behavior, keyboard semantics, and accessible names.

## Tests / manual checks

- Run core/desktop settings tests, lint, typecheck, and full QA.
- Manual keyboard-only pass (Tab/Enter/Escape), screen-reader outline, 200% zoom, high-contrast/dark/light themes, reduced-motion preference, and touch target check.
- Confirm changing a setting never writes settings JSON into the workspace and does not rewrite an existing journal note until an explicit note operation.

## Automated validation

Run core/desktop settings and accessibility tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test` or `./scripts/qa.sh`.

## Manual desktop/mobile checks

Desktop: keyboard/screen-reader/zoom/theme/reduced-motion pass and verify settings stay outside workspace. Mobile: Android/iOS touch, TalkBack/VoiceOver, text scaling, keyboard, and persistence checks against approved mockups.

## Non-goals

- No final visual design, calendar panel, journal workflow implementation, extension registration, credential handling, or app-wide accessibility rewrite.
- Do not add settings for unapproved behavior merely to make an implementation easier.
