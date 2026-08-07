# Story: Journal/Calendar Extension-Host Integration

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). This story owns only contribution/lifecycle wiring; journal behavior, Markdown storage, and UI remain in the feature stories. It coordinates with `plans/extensions/pending-beta_builtin_extensions-med-med.md`.

## Discovery constraints (approved 2026-08-07)

Decisions from `../pending-journal_discovery_and_wireframes-low-med.md` that bind this story:

- **D16** — Journal search reuses existing search infrastructure. Depends on the indexing/search epic's FTS5 cache; that cache is disposable, rebuildable, and never source of truth. Note this as a hard dependency.
- **D27** — The calendar is a CANVAS TAB, not an activity-bar entry. There is exactly ONE activity-bar entry (journal popout). The calendar is NOT registered in the panel registry or the activity bar.
- **D28** — Editor-hook registration for the metadata widget must test BOTH the journal-folder path AND the presence of configured frontmatter keys. A hook that checks only one condition is incorrect.
- **D31** — `--tn-*` tokens only; no hard-coded colors.

Architectural constraints from the digest that bind this story:

- Registration goes through `desktopExtensionHost` with its disposable scope; contributions enter via the existing panel registry (for the journal popout) and the tab-kind registry (for the calendar tab). Never a parallel action array.
- `packages/core` stays platform-agnostic; UI never calls Tauri directly — go through `apps/desktop/src/native/` adapters.
- Settings live outside the workspace, in OS app-data; namespaced via `extension-${extensionId}`. Secrets never in JSON settings (owned by a future Rust/native secret-store story).
- Extensions are trusted same-context modules; capabilities are compatibility declarations, NOT hostile-code isolation. URL install, signing, marketplace, and strong isolation remain DEFERRED.

The discovery gate is CLOSED for the decisions above.

## Questions first — STOP gate (still open for this story)

The items below are **genuinely undecided**. Do not register contributions or expand host contracts until each is resolved and recorded.

1. **Canonical built-in id and contribution ids:** What stable ids should journal and calendar contributions expose? Not yet decided.
2. **Activation event:** Is the journal/calendar built-in activated at startup, on first view, on command, or another trigger? Should it be lazy?
3. **Required beta contribution table:** Which commands, panel entries, and settings schema entries are required for the beta boundary? The owning beta story (`plans/extensions/pending-beta_builtin_extensions-med-med.md`) must confirm this list.
4. **Note-template contribution:** If note templates are included in the first slice, does a platform-neutral template contract exist in `packages/core/src/contributions.ts`? If not, this story must not invent one — defer or raise.
5. **Unavailable mobile capabilities:** How should desktop-only capabilities (activity bar, panel resize) be represented in the mobile/shared-webview activation path without pretending registration equals readiness?

**STOP gate:** Do not wire built-in registration, add namespaces, or expand host contracts until the id/activation/contribution table is approved and owning feature stories expose stable service/panel/settings contracts.

## Goal

Register the journal and calendar built-ins through `desktopExtensionHost` with disposable lifecycle ownership. Exactly one activity-bar entry (journal popout). Calendar opens as a canvas tab from the popout — no calendar activity-bar entry. Editor-hook for the metadata widget checks both journal-folder path and frontmatter keys (D28). Settings namespaced outside the workspace; secrets deferred.

## Scope

- One built-in extension id activating both journal and calendar contributions.
- Exactly ONE activity-bar entry (journal popout); the calendar is a tab, not an activity-bar entry (D27).
- Journal popout contribution enters via the existing panel registry.
- Calendar contribution enters via the tab-kind registry (not the panel registry, not a parallel action array).
- Editor-hook registration for `MetadataWidget` tests BOTH journal-folder path AND configured frontmatter keys (D28).
- Settings namespaced as `extension-${extensionId}` in OS app-data; no workspace settings, no secrets in JSON.
- Disposable scope: all contributions deactivate on deactivation/failure/shutdown.
- Extensions are trusted same-context modules; capability declarations only — no sandbox, no isolation.
- FTS5 cache dependency: journal search depends on the indexing/search epic's FTS5 cache; register or document this dependency explicitly; cache is disposable, rebuildable, never source of truth (D16).

Deferred (do not implement here): URL install, extension signing, marketplace, strong isolation, template contribution if the platform-neutral contract is absent.

## Likely files

- `apps/desktop/src/extensions/builtins/journalCalendarExtension.ts` (new built-in definition/activation adapter).
- `apps/desktop/src/extensions/builtins/journalCalendarExtension.test.ts` (new registration/lifecycle tests).
- `apps/desktop/src/extensions/builtins/index.ts` (new export/activation list).
- `apps/desktop/src/extensions/desktopExtensionHost.ts` and `.test.ts` (only if a missing approved contribution such as note templates requires a typed host bridge; preserve relative lowercase-kebab IDs and `extension-${extensionId}` settings namespace behavior).
- `packages/core/src/contributions.ts` and `contributions.test.ts` (only if a platform-neutral note-template contract/registry is approved and absent; no React/Tauri coupling).
- `apps/desktop/src/panels/panelRegistry.tsx` (consume journal panel contribution; do not add calendar here).
- `apps/desktop/src/tabs/tabRegistry.tsx` or equivalent (consume calendar tab-kind contribution; confirm registry location before editing).
- `apps/desktop/src/settings/settingsStore.ts` and `packages/core/src/settings/modules/index.ts` (consume the approved journal settings module through the existing registry).
- `apps/desktop/src/App.tsx` or a new `apps/desktop/src/extensions/extensionBootstrap.ts` (register/activate built-ins at the existing application lifecycle boundary; choose ONE owner, do not activate from multiple components).
- `apps/desktop/src/extensions/extensionBootstrap.test.ts` (new startup/dispose tests).

## Dependencies

- Approved id/activation table and completed or stable journal service, panel, calendar tab, and settings contracts.
  - `pending-journal_panel_ui-high-hard.md` must be stable before journal popout contribution is registered.
  - `pending-calendar_tab_ui-high-hard.md` must be stable before calendar tab contribution is registered; tab-kind registry location must be confirmed.
- Existing `desktopExtensionHost`, `DesktopExtensionContext`, command/panel/settings APIs, `desktopPanelRegistry`, disposable lifecycle tests.
- Indexing/search epic's FTS5 cache (D16) — explicit dependency; do not build a parallel index.
- Beta boundary: `plans/extensions/pending-beta_builtin_extensions-med-med.md`, `plans/extensions/pending-internal_contribution_points-low-med.md`, `plans/extensions/pending-extension_execution_model-low-med.md`.

## Acceptance criteria

- [ ] One canonical built-in extension id activates journal/calendar contributions through `desktopExtensionHost`; no direct registry mutation bypasses the host.
- [ ] Exactly one activity-bar entry (journal popout) is registered; no calendar activity-bar entry exists (D27).
- [ ] Journal popout contribution enters via the existing panel registry; calendar contribution enters via the tab-kind registry; neither uses a parallel action array.
- [ ] Editor-hook for `MetadataWidget` tests BOTH the journal-folder path AND configured frontmatter keys before registering (D28); a single-condition hook is a defect.
- [ ] Settings are namespaced as `extension-${extensionId}` in OS app-data; no workspace settings or secrets in JSON.
- [ ] All contributions are disposed on deactivation/failure/shutdown; deactivation does not remove other built-ins.
- [ ] Journal search dependency on the indexing/search epic's FTS5 cache is documented in code (comment or type-level dependency); the cache is never treated as source of truth.
- [ ] Mobile/shared-webview activation does not claim desktop-only capabilities; unsupported behavior follows the soft capability boundary.
- [ ] Registration collisions and missing feature dependencies fail loudly with typed/useful diagnostics.
- [ ] Integration tests cover: activation once, duplicate/canonical namespace handling, contribution lookup, failed activation cleanup, deactivation cleanup, and bootstrap unmount/shutdown.
- [ ] No duplicate path logic, metadata parsing, calendar aggregation, or UI state is introduced here.

## Tests / manual checks

- Run extension host/built-in/bootstrap tests, lint, typecheck, and full QA.
- Manual desktop: start app once, verify exactly one journal activity-bar entry appears (no calendar entry), invoke approved commands, open journal popout, open calendar tab from popout, change a namespaced setting, close/unmount, verify no stale registration remains.
- Manual failure case: disable/make unavailable one feature dependency; verify a clear unavailable state, not a crash or false success.
- Manual mobile: confirm the same registration path and that no desktop-only command/capability is exposed.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`). All extension host/built-in/bootstrap integration tests must pass.

## Manual desktop/mobile checks

Desktop: activate/deactivate approved built-in registrations once; verify panel, tab, command, and settings delegation and cleanup; confirm no calendar activity-bar button. Mobile: verify registration reports unavailable desktop capabilities without crashing or assuming desktop shell.

## Non-goals

- No extension manifest loader, URL install, signing, marketplace, sandbox, or third-party extension behavior.
- No strong isolation — extensions are trusted same-context modules; capabilities are compatibility declarations only.
- No secrets in JSON settings (deferred to Rust/native secret-store story).
- No final UX decision, journal/calendar data model, Markdown format, folder/naming policy, or panel/tab implementation.
- URL install, signing, marketplace, and strong isolation remain DEFERRED.

## Handoff artifacts

The following stories need from this one:

- Stable built-in extension id and contribution ids (needed by beta built-in extensions story and by QA).
- Confirmed registration API surface for the tab-kind registry (feeds `pending-calendar_tab_ui-high-hard.md` if it registers after this story).
- Settings namespace convention (`extension-${extensionId}`) documented for journal settings story.
- FTS5 cache dependency declaration, for the indexing/search epic to understand what the journal built-in requires.
