# Story: Journal/Calendar Extension-Host Integration

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). Owns only contribution/lifecycle wiring; journal behavior, Markdown storage, and UI remain in the feature stories. Coordinates with `plans/extensions/pending-beta_builtin_extensions-med-med.md`.

## Discovery constraints (approved 2026-08-07)

Decisions from `../pending-journal_discovery_and_wireframes-low-med.md` bind this story (rationale lives there, not here). Discovery gate is CLOSED for these:

- **D16** — Journal search reuses existing search infra; hard dependency on the indexing/search epic's FTS5 cache (disposable/rebuildable, never source of truth).
- **D27** — Calendar is a CANVAS TAB, not an activity-bar entry. Exactly ONE activity-bar entry (journal popout). Calendar is not in the panel registry or activity bar.
- **D28** — Metadata-widget editor-header contribution tests BOTH journal-folder path and configured frontmatter keys; one-condition behavior is a defect.
- **D31** — `--tn-*` tokens only; no hard-coded colors.
- **D44** — Metadata widget registers through the observable React editor-header surface, not CodeMirror `editorHooks`.
- **D45** — Settings support app and workspace scopes through the shared platform path.
- **D47** — Extension id `journal-calendar`; local ids `journal`, `calendar`, `new-entry`, `today`, `open-calendar`, `metadata-widget`.

Architectural constraints from findings/digest:

- Registration goes through `desktopExtensionHost` with disposable scope. Existing surfaces cover commands/panels/CodeMirror hooks/tabs/settings/workspace; D44 adds `editorHeaders` for React editor-header contributions. Journal → `panels`, calendar → `tabs`, metadata widget → `editorHeaders`.
- `packages/core` stays platform-agnostic; UI never calls Tauri directly — go through `apps/desktop/src/native/` adapters.
- App/workspace settings live outside the vault under `extension-journal-calendar` through D45's shared platform path. Secrets never use JSON settings.
- Extensions are trusted same-context modules; capabilities are compatibility declarations, NOT hostile-code isolation. URL install, signing, marketplace, strong isolation remain DEFERRED.

## Real registration API — authoritative

**Manifest** (`packages/core/src/extensions/manifest.ts`, `ExtensionManifest`): `id` (kebab-case), `name`, `version`, `apiVersion` (semver range), `engines.platform` (`"desktop"|"mobile"`), `activationEvents` (`"onStartup"`/`"onCommand:<id>"`/`"onView:<id>"`), `capabilities` (soft hints, not a sandbox), `contributes: { commands: {id,title}[], panels: {id,label,icon,side}[] }`. ONLY commands and panels are declared in the manifest — tabs, CodeMirror hooks, and D44 editor headers register at runtime inside `activate()`. Confirm at implementation time if a manifest-level tab declaration is wanted; do not invent one.

**Host** (`desktopExtensionHost` singleton): current runtime registrations are commands, panels, CodeMirror editor hooks, and tabs, plus settings/workspace. D44 adds `editorHeaders.register(...)` with the same disposable ownership and id prefixing. D47 fixes this extension to `journal-calendar`; relative ids become `${extensionId}.${id}` and settings use `extension-journal-calendar`. Relative ids remain lowercase kebab-case.

**Tab contribution surface (confirmed in code, not a gap):** `apps/desktop/src/tabs/tabRegistry.ts` exports `desktopTabRegistry`, an **app-wide singleton** (`register(view): Disposable`, `get(kind)`, `entries()`, `subscribe(listener)`). `DesktopTabView` extends `TabRegistration` (`kind`, `label`, `isAvailable`) plus `availability`, `unavailableMessage?`, and **`factory?: (context: DesktopTabContext) => ReactNode`**, where `DesktopTabContext` is `{ rootPath: string | null, tabId: string }` only. `apps/desktop/src/shell/TabContent.tsx` reads this singleton and, if `view.factory` exists, calls `view.factory({ rootPath, tabId })` **before** any built-in branch — **no shell edit is required to render a contributed kind**. Built-ins (`editor`, `preview`, `settings`, `graph`, `browser`) have no `factory` and stay shell-drawn, since the editor needs document state `DesktopTabContext` doesn't carry; a contributed kind omitting `factory` falls through to the editor branch and reports a missing document — always supply one. `openTab(kind, title)` exists on the workspace bridge published by `DesktopShell.tsx`, reachable via `context.workspace`, for opening a tab kind from the popout — confirm exact workspace-surface method name/shape at implementation time if it differs.

**Registration sequence:** copy the built-in pattern, declare manifest commands/panel, then register settings, panel `journal`, tab `calendar`, approved commands, and editor header `metadata-widget` inside `activate()`. Add the built-in once to `builtInExtensions`; disposable scope owns cleanup. D44 makes widget correctness independent of eager versus lazy activation.

## Editor timing — RESOLVED D44

The current CodeMirror registry remains mount-only, but the metadata widget no longer uses it.
D44's observable React editor-header registry must pass post-mount registration/disposal tests
before this integration story registers `metadata-widget`. Activation timing can therefore be
chosen from feature availability/performance needs, not as a correctness workaround.

## Questions first — STOP gate (still open)

Do not register contributions or expand host contracts until each is resolved and recorded:

1. **Activation event:** startup, first-view, command, or another trigger; D44 removes timing as a correctness constraint.
2. **Required beta contribution table:** which approved commands/panels/settings are exposed at beta.
3. **Mobile representation:** how desktop panel behavior maps to the shared mobile shell.
4. **Calendar factory contract:** whether `{ rootPath, tabId }` is sufficient without widening `DesktopTabContext`.

**STOP gate:** D47 namespace work is unblocked. Do not finalize activation, beta surface, mobile representation, or any host-contract expansion until their owners approve them. Templates remain out of v1 by D21.

## Goal & scope

Register journal and calendar built-ins through `desktopExtensionHost` with disposable lifecycle ownership, as one built-in extension id:

- Exactly ONE activity-bar entry (journal popout) via `context.panels.register(...)`; calendar is a tab, not an activity-bar entry (D27).
- Calendar canvas tab via `context.tabs.register(...)` with a `factory` rendering from `{ rootPath, tabId }`; opened from the popout via the workspace bridge's tab-open capability.
- Metadata widget via D44 `context.editorHeaders.register(...)` with local id `metadata-widget`; D28 tests both path and configured keys.
- App/workspace settings under `extension-journal-calendar` through D45; no feature-owned persistence or JSON secrets.
- Disposable scope: all contributions deactivate on deactivation/failure/shutdown. Extensions are trusted same-context modules; capability declarations only.
- FTS5 cache dependency (D16): register/document explicitly; cache is disposable, never source of truth.

Deferred (do not implement here): URL install, signing, marketplace, strong isolation, and templates (D21).

## Likely files

- `apps/desktop/src/extensions/builtins/journalCalendarExtension.tsx` (new definition/activation) + `.test.ts`.
- `apps/desktop/src/extensions/builtins/index.ts` (new export/activation entry).
- `apps/desktop/src/extensions/desktopExtensionHost.ts` / `.test.ts` — consume D44 `editorHeaders` and D45 scoped settings after their platform stories land; preserve D47 prefixing.
- `packages/core/src/extensions/manifest.ts` — reference only; don't change without an approved manifest field.
- `apps/desktop/src/panels/panelRegistry.tsx` — consume journal panel contribution; no calendar here.
- `apps/desktop/src/tabs/tabRegistry.ts` — consume via the existing `desktopTabRegistry` singleton through `context.tabs.register(...)`; no shell switch-statement change, do not edit `TabContent.tsx`.
- `apps/desktop/src/settings/settingsStore.ts`, `packages/core/src/settings/modules/index.ts` — consume the approved journal settings module through the existing registry.
- `apps/desktop/src/main.tsx` — bootstrap call site; built-ins registered via `bootstrapExtensions()` BEFORE `createRoot().render()`. Do not activate from multiple components.
- `apps/desktop/src/extensions/bootstrap.ts` — only if bootstrap options need to expand; preserve existing eager/lazy activation logic.

## Dependencies

- D47 ids in `plans/extensions/pending-beta_builtin_extensions-med-med.md` are approved; remaining beta matrix decisions still gate affected registrations.
- `pending-journal_panel_ui-high-hard.md` and `pending-calendar_tab_ui-high-hard.md` provide stable feature contracts.
- `plans/extensions/pending-editor_header_contribution-high-med.md` (D44) and `pending-extension_settings-low-med.md` (D45).
- Existing command/panel/tab/settings/workspace APIs and registries plus D44 editor headers; preserve disposable lifecycle tests.
- Indexing/search epic's FTS5 cache (D16) — do not build a parallel index.
- Beta boundary: `pending-beta_builtin_extensions-med-med.md`, `pending-internal_contribution_points-low-med.md`, `pending-extension_execution_model-low-med.md` (all in `plans/extensions/`).

## Acceptance criteria

- [ ] Built-in id `journal-calendar` activates only D47-prefixed contributions through `desktopExtensionHost`; no direct registry mutation.
- [ ] Exactly one activity-bar entry (journal popout) via `context.panels.register(...)`; no calendar activity-bar entry (D27).
- [ ] Calendar canvas tab registers via `context.tabs.register(...)` with a `factory`; renders correctly given only `{ rootPath, tabId }`; never falls through to the editor branch.
- [ ] `metadata-widget` registers through D44 `editorHeaders`, appears in already-open editors, disposes cleanly, and tests both D28 triggers.
- [ ] App/workspace settings use D45 under `extension-journal-calendar`, remain outside the vault, and never store secrets in JSON.
- [ ] All contributions disposed on deactivation/failure/shutdown; deactivation does not remove other built-ins; registration collisions and missing feature dependencies fail loudly with typed/useful diagnostics.
- [ ] Journal search's FTS5 dependency (D16) documented in code (comment or type-level); cache never treated as source of truth.
- [ ] Mobile/shared-webview activation does not claim desktop-only capabilities; unsupported behavior follows the soft capability boundary.
- [ ] Integration tests cover activation once, D47 namespace collisions, command/panel/tab/editor-header lookup, post-mount widget registration, failed activation cleanup, deactivation, and shutdown.
- [ ] No duplicate path logic, metadata parsing, calendar aggregation, or UI state introduced here.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`) pass; manual checks below performed.

## Manual desktop/mobile checks

- Desktop: start app once; verify exactly one journal activity-bar entry (no calendar entry); invoke approved commands; open journal popout; open calendar tab from popout; change a namespaced setting; close/unmount; verify no stale registration remains.
- Activate/deactivate with an editor already open; verify D44 adds/removes `metadata-widget` without remounting or stale UI.
- Failure case: disable one feature dependency; verify a clear unavailable state, not a crash or false success.
- Mobile: confirm the same registration path and that no desktop-only command/capability is exposed; no crash, no assumed desktop shell.

## Non-goals

- No extension manifest loader, URL install, signing, marketplace, sandbox, or third-party extension behavior; no strong isolation (trusted same-context modules, capability declarations only).
- No secrets in JSON settings (deferred to Rust/native secret-store story).
- No final UX decision, journal/calendar data model, Markdown format, folder/naming policy, or panel/tab visual implementation.
- No manifest-level tab-contribution declaration unless separately approved — runtime `context.tabs.register(...)` already exists and suffices.

## Handoff artifacts

- D47 registration matrix: `journal-calendar` with panel `journal`, tab `calendar`, commands `new-entry`/`today`/`open-calendar`, editor header `metadata-widget`.
- API surface: panels, tabs with factory, D44 editor headers, D45 app/workspace settings, and `${extensionId}.${id}` prefixing.
- D41 index dependency plus remaining activation/mobile/beta-table questions; no widget timing workaround.
