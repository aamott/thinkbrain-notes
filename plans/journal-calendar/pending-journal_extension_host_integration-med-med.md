# Story: Journal/Calendar Extension-Host Integration

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). This story owns only contribution/lifecycle wiring; journal behavior, Markdown storage, and UI remain in the feature stories. It coordinates with `plans/extensions/pending-beta_builtin_extensions-med-med.md`.

## Questions first

- What canonical built-in id and contribution ids should journal/calendar expose?
- Which activation event is approved (startup, view, command, or another) and should journal/calendar be lazy?
- Which commands, panel entries, template contributions, and settings schema are required for the beta boundary?
- How should unavailable mobile capabilities or missing workspace state be represented without pretending registration equals feature readiness?
- What should deactivate on window shutdown, workspace switch, failed activation, or panel removal?

**STOP gate:** Do not wire built-in registration, add namespaces, or expand host contracts until the owner approves the id/activation/contribution table and the owning feature stories expose stable service/panel/settings contracts. Do not duplicate journal/calendar behavior in this integration story.

## Goal

Register the approved journal and calendar built-ins through the shared trusted desktop extension host, using disposable lifecycle ownership and canonical namespaced contributions.

## Likely files

- `apps/desktop/src/extensions/builtins/journalCalendarExtension.ts` (new built-in definition/activation adapter).
- `apps/desktop/src/extensions/builtins/journalCalendarExtension.test.ts` (new registration/lifecycle tests).
- `apps/desktop/src/extensions/builtins/index.ts` (new export/activation list).
- `apps/desktop/src/extensions/desktopExtensionHost.ts` and `.test.ts` (only if a missing approved contribution such as note templates requires a typed host bridge; preserve relative lowercase-kebab IDs and `extension-${extensionId}` settings namespace behavior).
- `packages/core/src/contributions.ts` and `contributions.test.ts` (only if a platform-neutral note-template contract/registry is approved and absent; no React/Tauri coupling).
- `apps/desktop/src/panels/panelRegistry.tsx` (consume feature panel contributions, not duplicate panel implementation).
- `apps/desktop/src/settings/settingsStore.ts` and `packages/core/src/settings/modules/index.ts` (consume the approved journal settings module through the existing registry).
- `apps/desktop/src/App.tsx` or a new `apps/desktop/src/extensions/extensionBootstrap.ts` (register/activate built-ins at the existing application lifecycle boundary; choose one owner, do not activate from multiple components).
- `apps/desktop/src/extensions/extensionBootstrap.test.ts` (new startup/dispose tests).

## Dependencies

- Approved id/activation table and completed or stable journal service, panel, calendar panel, and settings contracts.
- Existing `desktopExtensionHost`, `DesktopExtensionContext`, command/panel/settings APIs, `desktopPanelRegistry`, and disposable lifecycle tests.
- Beta boundary: `plans/extensions/pending-beta_builtin_extensions-med-med.md`, `plans/extensions/pending-internal_contribution_points-low-med.md`, and `plans/extensions/pending-extension_execution_model-low-med.md`.

## Acceptance criteria

- [ ] One canonical built-in extension id activates journal/calendar contributions through `desktopExtensionHost`; no direct registry mutation bypasses the host.
- [ ] Approved activity-bar/panel entries, commands, note-template contribution, and namespaced settings schema are registered with relative lowercase-kebab IDs and disposed on deactivation/failure/shutdown.
- [ ] Existing panel factories and journal/calendar services are injected/referenced; this story contains no duplicate path logic, metadata parsing, calendar aggregation, or UI state.
- [ ] Registration collisions and missing feature dependencies fail loudly with typed/useful diagnostics; deactivation does not remove other built-ins.
- [ ] Mobile/shared-webview activation does not claim desktop-only capabilities; unsupported behavior follows the soft capability boundary.
- [ ] Integration tests cover activation once, duplicate/canonical namespace handling, contribution lookup, failed activation cleanup, deactivation cleanup, and bootstrap unmount/shutdown.
- [ ] The beta built-in integration story is updated only by its owning reviewer if status tracking is required; no unrelated extension or Git/AI plan is rewritten here.

## Tests / manual checks

- Run extension host/built-in/bootstrap tests, lint, typecheck, and full QA.
- Manual desktop: start app once, verify each approved entry appears once, invoke approved command, open each panel, change a namespaced setting, close/unmount, and verify no stale registration remains.
- Manual failure case: disable/make unavailable one feature dependency and verify a clear unavailable state rather than a crash or false success.
- Manual mobile: confirm registration uses the same frontend and no desktop-only command/capability is exposed.

## Automated validation

Run extension host/built-in/bootstrap integration tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test` or `./scripts/qa.sh`.

## Manual desktop/mobile checks

Desktop: activate/deactivate approved built-in registrations once and verify panel/command/settings delegation and cleanup. Mobile: verify the same registration path reports unavailable desktop capabilities without crashing or native desktop assumptions.

## Non-goals

- No extension manifest loader, marketplace/install path, sandbox, credentials, Git sync, AI/ACP work, or third-party extension behavior.
- No final UX decision, journal/calendar data model, Markdown format, folder/naming policy, or panel implementation.
