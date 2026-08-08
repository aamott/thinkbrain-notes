# Story: Journal Settings & Accessibility Contract

**Status:** 🟨 settings implemented (`apps/desktop/src/journal/journalSettings.ts`, `JournalFieldDefinitionsControl.tsx`) · **Urgency:** med · **Difficulty:** med

Remaining: workspace-scope persistence (D45 platform prerequisite), registration through the host (story 9), and the accessibility pass, which belongs with the panel UI.

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

The discovery gate is CLOSED; full rationale and D1-D47 live in
`../pending-journal_discovery_and_wireframes-low-med.md`.

- **D4/D7/D21:** user-defined four input types; configurable journal root; no templates or template settings.
- **D23/D45:** global/workspace definitions use same-id replacement with untouched globals retained; removed values remain visible/filterable as `unconfigured` and never rewrite notes.
- **D31:** keyboard and screen-reader support required; high contrast is theme-owned; use `--tn-*` tokens; reduced motion and formal touch-target audit are deferred.
- **D33:** settings/opening never rewrite notes; unknown frontmatter survives.
- **D34:** product owner signs off per artifact.

## STOP gate — CLOSED

Closed by D48-D70; full text in `../pending-journal_discovery_and_wireframes-low-med.md`.

- **Setting list and defaults — D64.** Four settings registered; see table in Scope below.
- **Field-definition setting shape — D49.** `fieldDefinitions` is a `string` setting rendered by
  a custom `journal-field-definitions` control holding a JSON array of field definitions; no new
  structured setting type.

Unchanged from discovery and still governing this story:

- **Reduced-motion and touch-target audit** remain deferred (D31). Do not ship these in this
  story.
- **High contrast** remains theme-owned, out of scope (D31). Use `--tn-*` tokens; never add
  hard-coded colors or mood mappings.

D45 closes precedence, platform direction, and drift behavior. Workspace scope remains an implementation dependency, not an open product choice.

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

## PLATFORM PREREQUISITE — workspace-scoped extension settings

Today's extension settings bridge is app-scoped only. D45 chooses to extend it rather than
defer D23. `plans/extensions/pending-extension_settings-low-med.md` now owns the shared
workspace-scoped API, persistence and UI rendering. This journal story consumes that path;
it must not create journal-owned workspace settings or silently fall back to global scope.

## Goal

Define and register the approved journal settings under `journal-calendar`, resolve global and workspace field definitions with D45's id overlay, preserve unconfigured values, and implement the keyboard/screen-reader contract. Settings remain outside the workspace; high contrast stays theme-owned.

## Scope

- **Setting list and defaults — D64.** The journal registers exactly these four settings:

  | Setting | Type | Scope | Default |
  |---|---|---|---|
  | `root` | path | app + workspace | `journal` |
  | `fieldDefinitions` | custom control (`journal-field-definitions`, D49) | app + workspace (D45) | empty |
  | `calendarDefaultView` | enum: `week` / `month` | app | `month` |
  | `startOfWeek` | enum: `system` / `monday` / `sunday` | app | `system` |

  Explicitly **not** settings in v1: templates (D21), folder-nesting pattern and filename format
  (fixed by D17), timezone or day-start offset (D19), and anything touching mood colors or
  iconography (D4, D31). Do not register any setting outside the four above.
- Settings schema: journal root plus global/workspace field definitions for D4's four types.
- Resolve definitions by stable id: workspace replaces the complete same-id global definition; untouched globals remain (D45).
- Preserve removed/narrowed values as visible/filterable `unconfigured` values with diagnostics; never rewrite notes.
- Persist outside the vault through app/workspace scopes under `extension-journal-calendar` (D45/D47).
- Accessibility: keyboard operation and screen-reader compatibility for journal/calendar controls (D31). Use `--tn-*` tokens throughout; no hard-coded colors.
- No template settings (D21).
- Diagnostic behavior for invalid settings (bad path, malformed field definition) with actionable messages.
- Staged save/reset/dirty-state using the existing settings contract (`context.settings.set` stages; user saves explicitly).

## Likely files

- `packages/core/src/settings/modules/journal.ts` — global/workspace schema under D47's `journal-calendar` namespace, implementing D64's four settings (`root`, `fieldDefinitions`, `calendarDefaultView`, `startOfWeek`) with `fieldDefinitions` using D49's custom-control shape.
- `packages/core/src/settings/modules/index.ts` and `packages/core/src/settings/index.ts` — exports/registration.
- `apps/desktop/src/settings/settingsStore.ts` — register module; preserve staged/save/reset semantics.
- `apps/desktop/src/settings/SettingsContent.tsx`, `SettingsNav.tsx`, `controls/` — render approved controls only; blocked on `pending-extension_settings-low-med.md` for extension-section rendering.
- `apps/desktop/src/journal/journalSettings.ts` — typed selector/validation adapter; UI should not import registry details directly.
- `apps/desktop/src/journal/journalSettings.test.ts`, `packages/core/src/settings/modules/journal.test.ts` — new.
- `apps/desktop/src/journal/accessibility.md` — implementation checklist and manual matrix (keyboard, screen-reader, token usage).

## Dependencies

- Discovery approval, data-model story, and modular settings stories (`plans/ui-shell/pending-modular_settings_system-med-hard.md` and child stories).
- **`plans/extensions/pending-extension_settings-low-med.md`** — D45 workspace scope plus extension-owned settings UI; explicit blocker for complete user-visible settings.
- Existing `appSettingsRegistry`, `useSettingsStore`, extension-scoped settings bridge, and CSS `--tn-*` tokens.
- Approved desktop/mobile wireframes for focus order and responsive behavior (per D34, these require per-artifact sign-off before controls are built).

## Acceptance criteria

- [x] D45 documents the approved workspace-support, id-overlay and definition-drift rules.
- [ ] Global and workspace definitions resolve by stable id; workspace replaces same-id definitions completely and untouched globals remain.
- [ ] Journal root setting is configurable and validated; unsafe paths produce actionable diagnostics (D7).
- [ ] Field definitions support multi-select, single-select, number, and text input types; no other types are added without approval (D4).
- [ ] No template settings exist in the schema (D21).
- [ ] App and workspace scopes persist outside the vault under `extension-journal-calendar`; workspaces cannot leak values into each other (D45/D47).
- [ ] Settings changes stage, validate, and show dirty state using `context.settings.set`; `packages/core` does not call Tauri directly.
- [ ] Changing a setting never rewrites an existing journal note (D33).
- [ ] Removed or narrowed values remain visible and filterable as `unconfigured`, with a diagnostic; existing frontmatter is never dropped or rewritten (D45).
- [ ] All journal/calendar UI controls use `--tn-*` tokens only; no hard-coded colors, no mood-color mappings (D31/D4).
- [ ] Journal/calendar controls are fully keyboard-operable: Tab/Shift-Tab focus order, Enter/Space activation, Escape dismissal (D31).
- [ ] Screen-reader: all controls have visible labels, errors are announced, status changes are live-region announced (D31).
- [ ] No color-only meaning anywhere in journal/calendar controls (D31).
- [ ] Tests cover schema/defaults/validation, app/workspace isolation, full same-id replacement, inherited globals, unconfigured values, persistence boundaries, staged behavior, keyboard semantics, and accessible names.
- [ ] **Settings are not assumed to be user-visible in the UI.** Acceptance criteria for settings visibility are conditional on `pending-extension_settings-low-med.md` delivering the rendering layer. Until then, verifiable programmatically only.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` or `./scripts/qa.sh` all pass.

## Validation

- Run core/desktop settings and accessibility tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test` or `./scripts/qa.sh`.
- Desktop: keyboard-only (Tab/Shift-Tab/Enter/Space/Escape), screen-reader labels/errors/live-region announcements, 200% zoom, and dark/light themes with `--tn-*` tokens only; verify settings stay outside the workspace, changes never rewrite notes, and no hard-coded colors leak. Mobile Android/iOS: check touch, TalkBack/VoiceOver, text scaling, keyboard, and persistence against approved mockups.
- If `pending-extension_settings-low-med.md` has shipped, verify settings sections and staged save/reset end-to-end; otherwise verify programmatically via `context.settings.get` / `context.settings.set`. High contrast is not required; reduced-motion and touch-target audit remain deferred (D31).

## Non-goals

- No template settings (D21).
- No hard-coded mood colors, activity icons, or emoji vocabulary (D4/D31).
- High contrast theming is out of scope — themes own it; journal uses `--tn-*` tokens (D31).
- Reduced-motion preference and formal touch-target audit are deferred (D31).
- No final visual design, calendar panel, journal workflow implementation, extension registration, credential handling, or app-wide accessibility rewrite.
- Do not add settings for unapproved behavior to simplify implementation.
- Do not create a journal-owned workspace settings path or weaken D45 to global-only fallback.

## Handoff artifacts

Downstream stories need:

- D45 global/workspace resolution and unconfigured-value contract.
- `getJournalSettings(scope)` — typed selector returning D45-resolved journal root and field definitions; no global-only fallback.
- `FieldDefinition` type: `{ id, label, type, options? }`, where `type` is one of `text` |
  `single-select` | `number` | `multi-select` and `options` is required for
  `single-select`/`multi-select` and forbidden otherwise (D49 — field name is `type`, not
  `inputType`).
- `journalSettingsSchema` — schema registration artifact.
- `apps/desktop/src/journal/accessibility.md` — checklist with pass/fail results for keyboard and screen-reader.
- Platform dependency on D45 workspace-scoped extension settings, linked to its owner story.
