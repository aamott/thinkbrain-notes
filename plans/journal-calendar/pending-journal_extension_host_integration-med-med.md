# Story: Journal/Calendar Extension-Host Integration

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). Owns only contribution/lifecycle wiring; journal behavior, Markdown storage, and UI remain in the feature stories. Coordinates with `plans/extensions/pending-beta_builtin_extensions-med-med.md`.

## Discovery constraints (approved 2026-08-07)

The discovery gate is CLOSED; rationale and D1-D47 live in
`../pending-journal_discovery_and_wireframes-low-med.md`.

- **D16:** reuse the disposable/rebuildable platform FTS5 cache; it is never source of truth.
- **D27:** exactly one activity-bar entry (`journal`); calendar is a canvas tab, not a panel/activity-bar entry.
- **D28/D44:** `metadata-widget` must test both journal-folder and configured-key triggers and register through the observable React editor-header surface, not CodeMirror hooks.
- **D31/D45:** use `--tn-*` tokens; settings use shared app/workspace scopes.
- **D47:** extension `journal-calendar`; local ids are `journal`, `calendar`, `new-entry`, `today`, `open-calendar`, and `metadata-widget`.

## Real registration API — authoritative

**Manifest** (`packages/core/src/extensions/manifest.ts`, `ExtensionManifest`): `id` (kebab-case), `name`, `version`, `apiVersion` (beta grammar: `*`, exact `x.y.z`, `^x.y.z`, or `~x.y.z`; other ranges are incompatible), `engines.platform` (`"desktop"|"mobile"`), `activationEvents` (`"onStartup"`/`"onCommand:<id>"`/`"onView:<id>"`), `capabilities` (soft compatibility hints, not permissions or a sandbox), `contributes: { commands: {id,title}[], panels: {id,label,icon,side}[] }`. ONLY commands and panels are declared in the manifest — tabs, CodeMirror hooks, and D44 editor headers register at runtime inside `activate()`. Confirm at implementation time if a manifest-level tab declaration is wanted; do not invent one.

**Host** (`desktopExtensionHost` singleton): current runtime registrations are commands, panels, CodeMirror editor hooks, and tabs, plus settings/workspace. D44 adds `editorHeaders.register(...)` with the same disposable ownership and id prefixing. D47 fixes this extension to `journal-calendar`; relative ids become `${extensionId}.${id}` and settings use `extension-journal-calendar`. Relative ids remain lowercase kebab-case.

**Tab contribution surface (confirmed in code, not a gap):** `apps/desktop/src/tabs/tabRegistry.ts` exports `desktopTabRegistry`, an **app-wide singleton** (`register(view): Disposable`, `get(kind)`, `entries()`, `subscribe(listener)`). `DesktopTabView` extends `TabRegistration` (`kind`, `label`, `isAvailable`) plus `availability`, `unavailableMessage?`, and **`factory?: (context: DesktopTabContext) => ReactNode`**, where `DesktopTabContext` is `{ rootPath: string | null, tabId: string }` only. `apps/desktop/src/shell/TabContent.tsx` reads this singleton and, if `view.factory` exists, calls `view.factory({ rootPath, tabId })` **before** any built-in branch — **no shell edit is required to render a contributed kind**. Built-ins (`editor`, `preview`, `settings`, `graph`, `browser`) have no `factory` and stay shell-drawn, since the editor needs document state `DesktopTabContext` doesn't carry; a contributed kind omitting `factory` falls through to the editor branch and reports a missing document — always supply one. Internal `openTab(kind, title)` exists on the shell workspace bridge, but `DesktopExtensionContext.workspace` does not expose it; the extension-facing open route is STOP-gated below.

**Registration sequence:** copy the built-in pattern, declare manifest commands/panel, then register settings, panel `journal`, tab `calendar`, approved commands, and editor header `metadata-widget` inside `activate()`. Add the built-in once to `builtInExtensions`; disposable scope owns cleanup. D44 makes widget correctness independent of eager versus lazy activation.

## Editor timing — RESOLVED D44

The current CodeMirror registry remains mount-only, but the metadata widget no longer uses it.
D44's observable React editor-header registry must pass post-mount registration/disposal tests
before this integration story registers `metadata-widget`. Activation timing can therefore be
chosen from feature availability/performance needs, not as a correctness workaround.

## STOP gate — CLOSED

Closed by D65-D70; full text in `../pending-journal_discovery_and_wireframes-low-med.md`.

- **Activation event — D65.** Lazy: `onView:journal` + the three commands; never `onStartup`.
- **Beta contribution table — D66.** All contributions real at beta; popout uses `PanelAction`.
- **Mobile representation — D67.** One ordinary left panel; inherits shell's mobile placement.
- **Calendar tab opening — D69 ✅ shipped.** Scoped `tabs.open(kind, title)`; `openTab` stays internal.
- **Service adapter boundary — D68 ✅ `listNotes` shipped.** `DesktopExtensionContext.workspace`, extended with `listNotes`.
- **Calendar factory contract — D70.** `DesktopTabContext` stays `{ rootPath, tabId }` for v1.

## Goal & scope

Register journal and calendar built-ins through `desktopExtensionHost` with disposable lifecycle ownership, as one built-in extension id:

- Exactly ONE activity-bar entry (journal popout) via `context.panels.register(...)`; calendar is a tab, not an activity-bar entry (D27).
- Calendar canvas tab via `context.tabs.register(...)` with a `{ rootPath, tabId }` factory; popout opening waits on the approved extension-facing tab-open route.
- Metadata widget via D44 `context.editorHeaders.register(...)` with local id `metadata-widget`; D28 tests both path and configured keys.
- App/workspace settings under `extension-journal-calendar` through D45; no feature-owned persistence or JSON secrets.
- Disposable scope: all contributions deactivate on deactivation/failure/shutdown. Extensions are trusted same-context modules; capability declarations only.
- Keep `packages/core` platform-agnostic and route UI/native work through `apps/desktop/src/native/`; FTS5 is disposable derived state, never source of truth (D16).

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
- D44 editor-header contribution (shipped 2026-08-08) and `pending-extension_settings-low-med.md` (D45).
- Existing command/panel/tab/settings/workspace APIs and registries plus D44 editor headers; preserve disposable lifecycle tests.
- Indexing/search epic's FTS5 cache (D16) — do not build a parallel index.
- Beta boundary: `pending-beta_builtin_extensions-med-med.md` (in `plans/extensions/`); internal
  contribution points and lifecycle/bootstrap integration have both shipped, their story files
  reviewed and deleted per the plan-review policy in `AGENTS.md`.

## Acceptance criteria

- [ ] Built-in id `journal-calendar` activates only D47-prefixed contributions through `desktopExtensionHost`; no direct registry mutation.
- [ ] Exactly one activity-bar entry (journal popout) via `context.panels.register(...)`; no calendar activity-bar entry (D27).
- [ ] Calendar tab registers via `context.tabs.register(...)` with a factory and never falls through to the editor branch; the popout opens it only through the approved extension-facing route.
- [ ] Story 3 and this story use one approved typed workspace/service boundary, not parallel adapter paths.
- [ ] `metadata-widget` registers through D44 `editorHeaders`, appears in already-open editors, disposes cleanly, and tests both D28 triggers.
- [ ] App/workspace settings use D45 under `extension-journal-calendar`, remain outside the vault, and never store secrets in JSON.
- [ ] All contributions disposed on deactivation/failure/shutdown; deactivation does not remove other built-ins; registration collisions and missing feature dependencies fail loudly with typed/useful diagnostics.
- [ ] Journal search's FTS5 dependency (D16) documented in code (comment or type-level); cache never treated as source of truth.
- [ ] Mobile/shared-webview activation does not claim desktop-only capabilities; unsupported behavior follows the soft capability boundary.
- [ ] Integration tests cover activation once, D47 namespace collisions, command/panel/tab/editor-header lookup, post-mount widget registration, failed activation cleanup, deactivation, and shutdown.
- [ ] No duplicate path logic, metadata parsing, calendar aggregation, or UI state introduced here.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`) pass; manual checks below performed.

## Manual desktop/mobile checks

- Desktop: start once and exercise the approved command/popout → calendar-tab flow; change a namespaced setting, close/unmount, and verify the single journal entry, no calendar activity entry, and no stale registration.
- With an editor already open, activate/deactivate and verify D44 adds/removes `metadata-widget` without remounting or stale UI.
- Disable one feature dependency and verify a clear unavailable state, not a crash or false success.
- Mobile: use the same registration path; verify no desktop-only command/capability, no crash, and no assumed desktop shell.

## Non-goals

- No extension manifest loader, URL install, signing, marketplace, sandbox, or third-party extension behavior; no strong isolation (trusted same-context modules, capability declarations only).
- No secrets in JSON settings (deferred to Rust/native secret-store story).
- No final UX decision, journal/calendar data model, Markdown format, folder/naming policy, or panel/tab visual implementation.
- No manifest-level tab-contribution declaration unless separately approved — runtime `context.tabs.register(...)` already exists and suffices.

## Handoff artifacts

- D47 registration matrix: `journal-calendar` with panel `journal`, tab `calendar`, commands `new-entry`/`today`/`open-calendar`, editor header `metadata-widget`.
- API surface: panels, tabs with factory, D44 editor headers, D45 app/workspace settings, and `${extensionId}.${id}` prefixing.
- D41 index dependency plus remaining activation/mobile/beta-table, tab-open, service-adapter, and factory questions; no widget timing workaround.
