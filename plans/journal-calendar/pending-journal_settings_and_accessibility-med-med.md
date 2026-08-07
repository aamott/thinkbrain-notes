# Story: Journal Settings & Accessibility Contract

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

Discovery gate is CLOSED for items below. See `../pending-journal_discovery_and_wireframes-low-med.md` for the full decision log. Do not re-litigate these.

- **D4** Metadata fields are user-defined. Four input types: multi-select, single-select, number, text. App ships NO mood scale and NO activity taxonomy.
- **D7** Journal root is configurable.
- **D21** No templates in the first slice. Template settings are OUT OF SCOPE.
- **D23** Field definitions exist at BOTH global and per-workspace level. Precedence and merge rules are **undecided and OWNED BY THIS STORY**. See platform conflict below.
- **D31** Accessibility must-haves: **keyboard operation** and **screen-reader compatibility**. Deferred: reduced-motion, formal touch-target audit. HIGH CONTRAST IS OUT OF SCOPE — themes own it. The journal must use `--tn-*` tokens only; never hard-coded colors.
- **D33** Settings must never cause the app to rewrite a journal note on open. Unknown frontmatter must survive.
- **D34** Approval cadence: per-artifact sign-off. Product owner is the approver.

**STOP gate:** The discovery gate above is closed. The following items remain OPEN and this story OWNS the decisions where marked:

- **Global/workspace field precedence (OWNED HERE):** D23 says this is undecided. This story must propose a precedence and merge rule (e.g. workspace overrides global, global fills gaps, union, last-write-wins) and get product-owner approval before implementing settings registration. Do not silently default. See platform conflict below — the workspace-scoped half is additionally blocked by a platform gap.
- **Setting list and defaults:** the exact list of configurable settings beyond journal root (D7) and field definitions (D4/D23) is not approved. Do not register settings for unapproved behavior.
- **Reduced-motion and touch-target audit:** deferred (D31). Do not ship these in this story.
- **High contrast:** out of scope — themes own it (D31). The journal must use `--tn-*` tokens; never add hard-coded colors or mood-color mappings.
- **Field definition drift and orphaned metadata:** what happens when a user removes a field definition is undecided. Surface as a diagnostic; do not silently drop data.

## Real settings API — authoritative

The scoped settings API is implemented in `apps/desktop/src/extensions/desktopExtensionHost.ts`. Inside `activate()`:

- `context.settings.registerSchema(schema)` — registers the extension's settings module. The host sets the module id automatically to `extension-${extensionId}`. `schema` is `SettingsModule` minus `id`.
- `context.settings.get<T>(key)` — reads the current value for the relative extension key (e.g. `"journalRoot"`).
- `context.settings.set(key, value)` — **stages** a change; not persisted until the user saves via the global Save button.
- `context.settings.onDidChange(key, listener): Disposable` — subscribes to changes.

**Persistence:** values are stored as JSON in OS app-data via Tauri native commands (`read_app_settings` / `write_app_settings`), namespaced as `extension-${extensionId}.${key}`. `packages/core` must not call Tauri directly; go through `apps/desktop/src/native/` adapters.

## DEPENDENCY: Extension settings are not yet visible in the settings UI

Extension settings schema is registered in `appSettingsRegistry` (the Zustand-backed store in `apps/desktop/src/settings/settingsStore.ts`), but the UI rendering of extension-owned settings sections is **not yet implemented**. This is tracked in `pending-extension_settings-low-med.md` (the API is partially implemented; the UI is pending).

**Consequence for this story:** journal settings will not be user-visible in the settings tab on first activation. Acceptance criteria must not assume a visible settings UI. All functional criteria (schema registration, get/set/onDidChange, persistence, staged save) can be verified programmatically. The visible settings UI is a dependency that must be listed explicitly; do not ship user documentation implying settings are configurable through the UI until `pending-extension_settings-low-med.md` delivers the rendering layer.

Add `pending-extension_settings-low-med.md` to the Dependencies section and adjust acceptance criteria accordingly (see below).

## PLATFORM CONFLICT on D23: No workspace-scoped extension settings path

All extension settings currently use `scope: "app"`. There is NO workspace-scoped extension settings path in the platform today. D23 requires field definitions at BOTH global and per-workspace level.

**D23 cannot be fully implemented on today's platform.** Two options, neither chosen here:

1. The platform gains workspace-scoped extension settings (new API work, not yet designed or tracked).
2. D23's workspace half is deferred; only global field definitions ship in the first slice.

**STOP-gate this choice.** Do not pick an option here. Surface it to the product owner with the platform constraint clearly stated. Record the decision in the discovery story before implementing any per-workspace field definition path. Until resolved, implement only the global (app-scoped) field definitions that the platform already supports.

## Goal

Define and register the approved journal settings schema (journal root configurable, user-defined field definitions at global scope — workspace scope is blocked by a platform gap), implement the accessibility contract (keyboard + screen reader), and establish the precedence/merge rule for global vs. per-workspace field definitions (STOP-gated on platform gap resolution). Settings live outside the workspace in OS app-data. High contrast is out of scope (themes own it, use `--tn-*` tokens).

## Scope

- Settings schema: journal root path (D7); global field definitions (D4, four input types); per-workspace field definitions (D4/D23) — **blocked on platform gap resolution**.
- Precedence/merge rule: propose, get approval, implement (D23 owned here) — **blocked on platform gap resolution for the workspace half**.
- Settings stored in OS app-data via `extension-${extensionId}` namespace; never in the workspace vault (boundary rule).
- Accessibility: keyboard operation and screen-reader compatibility for journal/calendar controls (D31). Use `--tn-*` tokens throughout; no hard-coded colors.
- No template settings (D21).
- Diagnostic behavior for invalid settings (bad path, malformed field definition) with actionable messages.
- Staged save/reset/dirty-state using the existing settings contract (`context.settings.set` stages; user saves explicitly).

## Likely files

- `packages/core/src/settings/modules/journal.ts` — workspace-scoped module/schema; exact keys wait for owner approval.
- `packages/core/src/settings/modules/index.ts` and `packages/core/src/settings/index.ts` — exports/registration.
- `apps/desktop/src/settings/settingsStore.ts` — register module; preserve staged/save/reset semantics.
- `apps/desktop/src/settings/SettingsContent.tsx`, `SettingsNav.tsx`, `controls/` — render approved controls only; blocked on `pending-extension_settings-low-med.md` for extension-section rendering.
- `apps/desktop/src/journal/journalSettings.ts` — typed selector/validation adapter; UI should not import registry details directly.
- `apps/desktop/src/journal/journalSettings.test.ts`, `packages/core/src/settings/modules/journal.test.ts` — new.
- `apps/desktop/src/journal/accessibility.md` — implementation checklist and manual matrix (keyboard, screen-reader, token usage).

## Dependencies

- Discovery approval, data-model story, and modular settings stories (`plans/ui-shell/pending-modular_settings_system-med-hard.md` and child stories).
- **`pending-extension_settings-low-med.md`** — settings UI rendering for extension-owned sections is not yet implemented. Journal settings will not be visible in the settings tab until this story ships. Explicit blocker for user-visible settings.
- Platform decision on workspace-scoped extension settings (required for D23's workspace half) — STOP-gated; see platform conflict above.
- Product-owner decision on global/workspace precedence rule — STOP-gated until workspace-scoped platform gap is resolved.
- Existing `appSettingsRegistry`, `useSettingsStore`, extension-scoped settings bridge, and CSS `--tn-*` tokens.
- Approved desktop/mobile wireframes for focus order and responsive behavior (per D34, these require per-artifact sign-off before controls are built).

## Acceptance criteria

- [ ] Product-owner-approved precedence/merge rule for global vs. per-workspace field definitions is documented (D23, owned here) — workspace half is STOP-gated on platform gap resolution; do not implement per-workspace path until unblocked.
- [ ] Journal root setting is configurable and validated; unsafe paths produce actionable diagnostics (D7).
- [ ] Field definitions support multi-select, single-select, number, and text input types; no other types are added without approval (D4).
- [ ] No template settings exist in the schema (D21).
- [ ] Settings are stored outside the workspace in OS app-data via `extension-${extensionId}` namespace; no settings JSON is written into the vault (boundary rule).
- [ ] Settings changes stage, validate, and show dirty state using `context.settings.set`; `packages/core` does not call Tauri directly.
- [ ] Changing a setting never rewrites an existing journal note (D33).
- [ ] Field definition removal produces a diagnostic; existing note frontmatter is NOT silently dropped.
- [ ] All journal/calendar UI controls use `--tn-*` tokens only; no hard-coded colors, no mood-color mappings (D31/D4).
- [ ] Journal/calendar controls are fully keyboard-operable: Tab/Shift-Tab focus order, Enter/Space activation, Escape dismissal (D31).
- [ ] Screen-reader: all controls have visible labels, errors are announced, status changes are live-region announced (D31).
- [ ] No color-only meaning anywhere in journal/calendar controls (D31).
- [ ] Tests cover: schema registration, defaults, validation (good/bad path, bad field type), persistence boundaries (OS app-data not vault), dirty/staged behavior, keyboard semantics, accessible names, precedence rule (global interaction — workspace half deferred until platform gap resolved).
- [ ] **Settings are not assumed to be user-visible in the UI.** Acceptance criteria for settings visibility are conditional on `pending-extension_settings-low-med.md` delivering the rendering layer. Until then, verifiable programmatically only.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` or `./scripts/qa.sh` all pass.

## Tests / manual checks

- Run core/desktop settings tests, `pnpm lint`, `pnpm typecheck`, and full QA (`./scripts/qa.sh`).
- Manual keyboard-only pass: Tab/Enter/Escape through all journal settings controls and journal/calendar interactive surfaces.
- Screen-reader pass: verify labels, error announcements, and live-region status changes.
- 200% zoom: verify no truncation or overlap in settings controls.
- Dark/light theme: verify `--tn-*` tokens apply; verify no hard-coded color leaks.
- High-contrast: not required (out of scope, D31).
- Reduced-motion: deferred (D31).
- Touch-target audit: deferred (D31).
- Confirm changing a setting never writes settings JSON into the workspace.
- Confirm changing a setting never rewrites an existing journal note.
- If `pending-extension_settings-low-med.md` has shipped: verify journal settings sections appear in the settings tab UI and staged save/reset works end-to-end. If not shipped: verify programmatically via `context.settings.get` / `context.settings.set`.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` or `./scripts/qa.sh` on core/desktop settings and accessibility tests.

## Manual desktop/mobile checks

Desktop: keyboard/screen-reader/zoom/dark/light theme pass; verify settings stay outside workspace. Mobile: Android/iOS touch, TalkBack/VoiceOver, text scaling, keyboard, and persistence checks against approved mockups. High contrast and reduced-motion: out of scope / deferred (D31).

## Non-goals

- No template settings (D21).
- No hard-coded mood colors, activity icons, or emoji vocabulary (D4/D31).
- High contrast theming is out of scope — themes own it; journal uses `--tn-*` tokens (D31).
- Reduced-motion preference and formal touch-target audit are deferred (D31).
- No final visual design, calendar panel, journal workflow implementation, extension registration, credential handling, or app-wide accessibility rewrite.
- Do not add settings for unapproved behavior to simplify implementation.
- Do not implement the workspace-scoped settings path until the platform gap and D23 workspace decision are resolved.

## Handoff artifacts

Downstream stories need:

- Approved precedence/merge rule for global vs. per-workspace field definitions (product-owner sign-off document) — workspace half blocked; document the gap alongside whatever global-only rule ships first.
- `getJournalSettings(scope)` — typed selector returning resolved journal root and field definitions after precedence rule is applied. Note: workspace scope returns global values until platform gap is resolved.
- `FieldDefinition` type (id, label, inputType: multi-select | single-select | number | text).
- `journalSettingsSchema` — schema registration artifact.
- `apps/desktop/src/journal/accessibility.md` — checklist with pass/fail results for keyboard and screen-reader.
- Platform gap statement for D23 (workspace-scoped extension settings) — forwarded to the platform team for scoping.
