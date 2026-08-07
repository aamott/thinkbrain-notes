# Story: Journal/Calendar Extension-Host Integration

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). Owns only contribution/lifecycle wiring; journal behavior, Markdown storage, and UI remain in the feature stories. Coordinates with `plans/extensions/pending-beta_builtin_extensions-med-med.md`.

## Discovery constraints (approved 2026-08-07)

Decisions from `../pending-journal_discovery_and_wireframes-low-med.md` bind this story (rationale lives there, not here). Discovery gate is CLOSED for these:

- **D16** — Journal search reuses existing search infra; hard dependency on the indexing/search epic's FTS5 cache (disposable/rebuildable, never source of truth).
- **D27** — Calendar is a CANVAS TAB, not an activity-bar entry. Exactly ONE activity-bar entry (journal popout). Calendar is not in the panel registry or activity bar.
- **D28** — Metadata-widget editor hook must test BOTH the journal-folder path AND presence of configured frontmatter keys; single-condition hook is a defect.
- **D31** — `--tn-*` tokens only; no hard-coded colors.

Architectural constraints from findings/digest:

- Registration goes through the `desktopExtensionHost` singleton with its disposable scope. `DesktopExtensionContext` exposes **five** contribution surfaces — `commands`, `panels`, `editorHooks`, `tabs`, `settings` — plus `workspace` (reading/writing/creating/opening notes). Journal popout → `panels`; calendar tab → `tabs`; metadata-widget hook → `editorHooks`. Never the panel registry for the latter two.
- `packages/core` stays platform-agnostic; UI never calls Tauri directly — go through `apps/desktop/src/native/` adapters.
- Settings live outside the workspace, in OS app-data; namespaced via `extension-${extensionId}`. Secrets never in JSON settings (future Rust/native secret-store story).
- Extensions are trusted same-context modules; capabilities are compatibility declarations, NOT hostile-code isolation. URL install, signing, marketplace, strong isolation remain DEFERRED.

## Real registration API — authoritative

**Manifest** (`packages/core/src/extensions/manifest.ts`, `ExtensionManifest`): `id` (kebab-case), `name`, `version`, `apiVersion` (semver range), `engines.platform` (`"desktop"|"mobile"`), `activationEvents` (`"onStartup"`/`"onCommand:<id>"`/`"onView:<id>"`), `capabilities` (soft hints, not a sandbox), `contributes: { commands: {id,title}[], panels: {id,label,icon,side}[] }`. ONLY commands and panels are declared in the manifest — tabs and editor hooks register at runtime inside `activate()`. Confirm at implementation time if a manifest-level tab declaration is wanted; do not invent one.

**Host** (`desktopExtensionHost` singleton, `apps/desktop/src/extensions/desktopExtensionHost.ts`): `register(ext): Disposable`, `registerAndActivate(ext): Promise<Disposable>`. `DesktopExtensionContext` passed to `activate()` has five surfaces — `commands.register(cmd)`, `panels.register(panel)`, `editorHooks.register(hook)`, `tabs.register(tab)` (each → `Disposable`) — plus `settings: DesktopExtensionSettings` and `workspace: DesktopExtensionWorkspace`. Every relative id (command/panel/editor-hook/tab-kind) is namespaced by the same `prefixId(extensionId, kind, id)` helper to **`${extensionId}.${id}`** (e.g. `journal-calendar.calendar`); settings module id is `extension-${extensionId}`. Relative ids must match `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` or registration throws.

**Tab contribution surface (confirmed in code, not a gap):** `apps/desktop/src/tabs/tabRegistry.ts` exports `desktopTabRegistry`, an **app-wide singleton** (`register(view): Disposable`, `get(kind)`, `entries()`, `subscribe(listener)`). `DesktopTabView` extends `TabRegistration` (`kind`, `label`, `isAvailable`) plus `availability`, `unavailableMessage?`, and **`factory?: (context: DesktopTabContext) => ReactNode`**, where `DesktopTabContext` is `{ rootPath: string | null, tabId: string }` only. `apps/desktop/src/shell/TabContent.tsx` reads this singleton and, if `view.factory` exists, calls `view.factory({ rootPath, tabId })` **before** any built-in branch — **no shell edit is required to render a contributed kind**. Built-ins (`editor`, `preview`, `settings`, `graph`, `browser`) have no `factory` and stay shell-drawn, since the editor needs document state `DesktopTabContext` doesn't carry; a contributed kind omitting `factory` falls through to the editor branch and reports a missing document — always supply one. `openTab(kind, title)` exists on the workspace bridge published by `DesktopShell.tsx`, reachable via `context.workspace`, for opening a tab kind from the popout — confirm exact workspace-surface method name/shape at implementation time if it differs.

**Registration sequence** (copy `apps/desktop/src/extensions/builtins/noteStats.tsx`): declare `ExtensionManifest` (commands + panels only) → export `activate(context)` calling `settings.registerSchema`, `panels.register`, `tabs.register`, `commands.register`, `editorHooks.register` as needed (each auto-added to `context.subscriptions`) → add `{ manifest, activate }` to `builtInExtensions` in `builtins/index.ts` → `bootstrapExtensions()` (in `main.tsx`, BEFORE `createRoot().render()`) registers stubs and lazy-activates; `onStartup` extensions activate eagerly, others on first stub touch. No `deactivate` hook needed — subscriptions clean up via disposable scope.

## RISK: Lazy-activation vs. editor-hook timing

`markdownEditorHookRegistry` is read once by `MarkdownEditor` in a mount-only effect and never subscribed to afterward — a hook registered after an editor has mounted silently no-ops on that instance.

**First task before writing activation code:** verify empirically (re-check `MarkdownEditor.tsx`'s effect deps) whether a hook registered post-mount is picked up. If not, decide between (a) `onStartup` activation so hooks register before any editor mounts, or (b) a registry-change re-effect in `MarkdownEditor.tsx`. Do NOT decide here — affects startup performance and editor lifecycle; needs product-owner input.

## Questions first — STOP gate (still open)

Do not register contributions or expand host contracts until each is resolved and recorded:

1. **Canonical ids:** stable built-in extension id and relative contribution ids (commands, panels, tab kind, settings keys). NOT yet decided — `pending-beta_builtin_extensions-med-med.md` owns this and has not settled it. Hard STOP gate for any registration work.
2. **Activation event:** startup, first-view, command, or other trigger — depends on the lazy-activation RISK resolution above.
3. **Required beta contribution table:** which commands/panels/settings entries are required for the beta boundary — owned by the beta built-ins story.
4. **Note-template contribution:** if templates ship in slice 1, does a platform-neutral contract exist in `packages/core/src/contributions.ts`? If not, don't invent one — defer or raise.
5. **Mobile representation:** how are desktop-only capabilities (activity bar, panel resize) represented on mobile without implying registration equals readiness?
6. **Calendar factory contract:** does it need anything beyond `{ rootPath, tabId }` (e.g. a selected date), and if so how, given `DesktopTabContext` is fixed? Confirm at implementation time.

**STOP gate:** no registration, namespace, or host-contract work until the id/activation/contribution table in `pending-beta_builtin_extensions-med-med.md` is approved.

## Goal & scope

Register journal and calendar built-ins through `desktopExtensionHost` with disposable lifecycle ownership, as one built-in extension id:

- Exactly ONE activity-bar entry (journal popout) via `context.panels.register(...)`; calendar is a tab, not an activity-bar entry (D27).
- Calendar canvas tab via `context.tabs.register(...)` with a `factory` rendering from `{ rootPath, tabId }`; opened from the popout via the workspace bridge's tab-open capability.
- Metadata-widget editor hook via `context.editorHooks.register(...)` — NOT the panel registry. Tests BOTH journal-folder path AND configured frontmatter keys (D28).
- Settings namespaced as `extension-${extensionId}` in OS app-data; no workspace settings, no secrets in JSON.
- Disposable scope: all contributions deactivate on deactivation/failure/shutdown. Extensions are trusted same-context modules; capability declarations only.
- FTS5 cache dependency (D16): register/document explicitly; cache is disposable, never source of truth.

Deferred (do not implement here): URL install, extension signing, marketplace, strong isolation, template contribution if the platform-neutral contract is absent.

## Likely files

- `apps/desktop/src/extensions/builtins/journalCalendarExtension.ts` (new definition/activation) + `.test.ts`.
- `apps/desktop/src/extensions/builtins/index.ts` (new export/activation entry).
- `apps/desktop/src/extensions/desktopExtensionHost.ts` / `.test.ts` — only if an approved contribution needs a typed host-bridge change; preserve relative kebab-case ids, `extension-${extensionId}` namespace, and the `tabs` surface's existing shape.
- `packages/core/src/extensions/manifest.ts` — reference only; don't change without an approved manifest field.
- `packages/core/src/contributions.ts` / `.test.ts` — only if a platform-neutral note-template contract is approved and absent; no React/Tauri coupling.
- `apps/desktop/src/panels/panelRegistry.tsx` — consume journal panel contribution; no calendar here.
- `apps/desktop/src/tabs/tabRegistry.ts` — consume via the existing `desktopTabRegistry` singleton through `context.tabs.register(...)`; no shell switch-statement change, do not edit `TabContent.tsx`.
- `apps/desktop/src/settings/settingsStore.ts`, `packages/core/src/settings/modules/index.ts` — consume the approved journal settings module through the existing registry.
- `apps/desktop/src/main.tsx` — bootstrap call site; built-ins registered via `bootstrapExtensions()` BEFORE `createRoot().render()`. Do not activate from multiple components.
- `apps/desktop/src/extensions/bootstrap.ts` — only if bootstrap options need to expand; preserve existing eager/lazy activation logic.

## Dependencies

- `pending-beta_builtin_extensions-med-med.md` must decide canonical ids first — hard STOP gate.
- `pending-journal_panel_ui-high-hard.md` stable before journal popout registers; `pending-calendar_tab_ui-high-hard.md` stable before calendar tab registers (the tab contribution *point* already exists in code — this is about UI content readiness, not the API).
- Lazy-activation RISK resolution (see above).
- Existing `desktopExtensionHost`, `DesktopExtensionContext`, command/panel/editor-hook/tab/settings APIs, `desktopPanelRegistry`, `desktopTabRegistry`, disposable lifecycle tests.
- Indexing/search epic's FTS5 cache (D16) — do not build a parallel index.
- Beta boundary: `pending-beta_builtin_extensions-med-med.md`, `pending-internal_contribution_points-low-med.md`, `pending-extension_execution_model-low-med.md` (all in `plans/extensions/`).

## Acceptance criteria

- [ ] One canonical built-in extension id activates journal/calendar contributions through `desktopExtensionHost`; no direct registry mutation bypasses the host.
- [ ] Exactly one activity-bar entry (journal popout) via `context.panels.register(...)`; no calendar activity-bar entry (D27).
- [ ] Calendar canvas tab registers via `context.tabs.register(...)` with a `factory`; renders correctly given only `{ rootPath, tabId }`; never falls through to the editor branch.
- [ ] Metadata-widget editor hook via `context.editorHooks.register(...)`, NOT the panel registry; tests BOTH journal-folder path AND configured frontmatter keys (D28) — single-condition hook is a defect.
- [ ] Lazy-activation timing risk resolved empirically before editor-hook code is merged.
- [ ] Settings namespaced as `extension-${extensionId}` in OS app-data; no workspace settings or secrets in JSON.
- [ ] All contributions disposed on deactivation/failure/shutdown; deactivation does not remove other built-ins; registration collisions and missing feature dependencies fail loudly with typed/useful diagnostics.
- [ ] Journal search's FTS5 dependency (D16) documented in code (comment or type-level); cache never treated as source of truth.
- [ ] Mobile/shared-webview activation does not claim desktop-only capabilities; unsupported behavior follows the soft capability boundary.
- [ ] Integration tests cover: activation once, duplicate/canonical namespace handling, contribution lookup (commands/panels/tabs/editor-hooks), failed activation cleanup, deactivation cleanup, bootstrap unmount/shutdown.
- [ ] No duplicate path logic, metadata parsing, calendar aggregation, or UI state introduced here.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`) pass; manual checks below performed.

## Manual desktop/mobile checks

- Desktop: start app once; verify exactly one journal activity-bar entry (no calendar entry); invoke approved commands; open journal popout; open calendar tab from popout; change a namespaced setting; close/unmount; verify no stale registration remains.
- Editor-hook timing: verify the metadata widget appears in an already-open editor, or confirm the activation sequence prevents the edge case.
- Failure case: disable one feature dependency; verify a clear unavailable state, not a crash or false success.
- Mobile: confirm the same registration path and that no desktop-only command/capability is exposed; no crash, no assumed desktop shell.

## Non-goals

- No extension manifest loader, URL install, signing, marketplace, sandbox, or third-party extension behavior; no strong isolation (trusted same-context modules, capability declarations only).
- No secrets in JSON settings (deferred to Rust/native secret-store story).
- No final UX decision, journal/calendar data model, Markdown format, folder/naming policy, or panel/tab visual implementation.
- No manifest-level tab-contribution declaration unless separately approved — runtime `context.tabs.register(...)` already exists and suffices.

## Handoff artifacts

- Stable built-in extension id and relative contribution ids (commands, panels, tab kind, settings keys) — needed by beta built-ins story and QA; blocked on `pending-beta_builtin_extensions-med-med.md`.
- Confirmed API surface: panels via `context.panels.register(...)`, tabs via `context.tabs.register(...)` (with `factory`), editor hooks via `context.editorHooks.register(...)`; id-prefixing format `${extensionId}.${id}`.
- Settings namespace convention (`extension-${extensionId}`), documented for the journal settings story. Extension-owned settings sections still aren't rendered in the settings UI — flag for whichever story owns that surface.
- FTS5 cache dependency declaration for the indexing/search epic; lazy-activation timing risk resolution for `markdownEditorHookRegistry`.
