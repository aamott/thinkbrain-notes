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

Architectural constraints from the findings and digest that bind this story:

- Registration goes through the `desktopExtensionHost` singleton (`apps/desktop/src/extensions/desktopExtensionHost.ts`) with its disposable scope. The host exposes a `DesktopExtensionContext` with exactly four surfaces: `commands`, `panels`, `editorHooks`, `settings`. There is NO `tabs` surface on `DesktopExtensionContext`.
- The journal popout contribution enters via `context.panels.register(...)`. The calendar canvas tab does NOT enter via the panel registry and CANNOT be registered through `DesktopExtensionContext` today — see PREREQUISITE / BLOCKER below.
- The editor-hook for the metadata widget enters via `context.editorHooks.register(...)`, NOT via the panel registry. The panel registry is for activity-bar/title-bar sidebar panels only.
- `packages/core` stays platform-agnostic; UI never calls Tauri directly — go through `apps/desktop/src/native/` adapters.
- Settings live outside the workspace, in OS app-data; namespaced via `extension-${extensionId}`. Secrets never in JSON settings (owned by a future Rust/native secret-store story).
- Extensions are trusted same-context modules; capabilities are compatibility declarations, NOT hostile-code isolation. URL install, signing, marketplace, and strong isolation remain DEFERRED.

The discovery gate is CLOSED for the decisions above.

## Real registration API — authoritative

### Manifest

File: `packages/core/src/extensions/manifest.ts`, type `ExtensionManifest`.

Exact fields:
```ts
{
  id: string                              // lowercase kebab-case
  name: string
  version: string
  apiVersion: string                      // semver range, e.g. "^1.0.0"
  engines: { platform: readonly ExtensionPlatform[] }  // "desktop" | "mobile"
  activationEvents: readonly string[]     // "onStartup" | "onCommand:<id>" | "onView:<id>"
  capabilities: readonly string[]         // soft hints only, NOT a sandbox
  contributes: {
    commands: ManifestCommand[]           // { id, title }
    panels: ManifestPanel[]               // { id, label, icon, side: "left"|"right" }
  }
}
```

`contributes` supports ONLY `commands` and `panels`. There are NO tab contributions, NO editor-hook contributions in the manifest. Editor hooks are registered at runtime inside `activate()`.

Activation events: `"onStartup"`, `"onCommand:<id>"`, `"onView:<id>"`.

### Desktop extension host

Singleton: `desktopExtensionHost` in `apps/desktop/src/extensions/desktopExtensionHost.ts`.

Registration API:
- `desktopExtensionHost.register(ext: DesktopExtensionDefinition): Disposable`
- `desktopExtensionHost.registerAndActivate(ext: DesktopExtensionDefinition): Promise<Disposable>`

The context passed to `activate()` at activation time:
```ts
interface DesktopExtensionContext extends ExtensionContext {
  commands:    { register(cmd: DesktopExtensionCommand): Disposable }
  panels:      { register(panel: DesktopExtensionPanel): Disposable }
  editorHooks: { register(hook: DesktopExtensionEditorHook): Disposable }
  settings:    DesktopExtensionSettings
}
```

Contribution IDs are automatically prefixed as `${extensionId}.${relativeId}`. Settings module ID is automatically set to `extension-${extensionId}`.

### Registration sequence (copy the Note Stats pattern)

Reference implementation: `apps/desktop/src/extensions/builtins/noteStats.tsx`, registered in `apps/desktop/src/extensions/builtins/index.ts`, bootstrapped by `bootstrapExtensions()` from `apps/desktop/src/main.tsx`.

Sequence:
1. Declare an `ExtensionManifest` with `id`, `activationEvents`, and `contributes` (commands + panels only).
2. Export an `activate(context: DesktopExtensionContext): void` function. Inside it: call `context.settings.registerSchema(...)`, then `context.panels.register(...)`, then `context.commands.register(...)`, then `context.editorHooks.register(...)` for any editor hooks. Each returns a `Disposable` added automatically to `context.subscriptions` by the host wrapper.
3. Add `{ manifest, activate }` to the `builtInExtensions` array in `apps/desktop/src/extensions/builtins/index.ts`.
4. `bootstrapExtensions()` (called in `apps/desktop/src/main.tsx` BEFORE `createRoot().render()`) reads `builtInExtensions`, registers stubs, and lazy-activates on demand. Extensions with `onStartup` are activated eagerly before React render; others activate when a stub command/panel is first touched.

No `deactivate` hook is needed — subscriptions clean up via the disposable scope.

## PREREQUISITE / BLOCKER: No tab-kind contribution point exists

There is NO `tabs` surface on `DesktopExtensionContext` and NO exported app-wide tab-kind registry singleton. `apps/desktop/src/tabs/tabRegistry.ts` (note: `.ts`, not `.tsx`) exports only a factory function (`createDesktopTabRegistry()`), not a singleton. `apps/desktop/src/shell/TabContent.tsx` creates its own module-scoped registry instance and switches on `tab.kind` — that switch statement is what must be changed to render a new kind. This is a shell-level change, not an extension contribution, and it is untracked by any current story.

The calendar canvas tab (D27) cannot be registered through `DesktopExtensionContext` on today's platform. `apps/desktop/src/shell/TabContent.tsx` is the file that must change (add a new rendering branch), in addition to any kind registration in `tabRegistry.ts`. Recommend (do not create here) a small prerequisite story for a tab-kind contribution point. Flag that adding a `TabKind` value also touches `packages/core/src/layout/index.ts`, which is platform-agnostic — coordinate carefully.

Do not describe the calendar tab as "entering via the tab-kind registry" until that contribution point exists and is confirmed.

## RISK: Lazy-activation vs. editor hook timing

`markdownEditorHookRegistry` (in `apps/desktop/src/tabs/markdownEditorHooks.ts`) is assembled once at `MarkdownEditor` mount via `markdownEditorHookRegistry.getExtensions(payload, undefined)`. If the journal extension activates lazily (e.g. `onView:journal`) AFTER the editor has already mounted, a runtime-registered editor hook may never apply to the running editor instance.

**First task before writing any activation code:** verify empirically whether a hook registered after editor mount is picked up by an already-mounted `MarkdownEditor`. If it is not, decide between (a) switching the journal to `onStartup` activation so hooks register before editor mount, or (b) adding a registry-change re-effect in `MarkdownEditor.tsx`. Do NOT pick the answer here — the choice has implications for startup performance and editor lifecycle that require product-owner input.

## Questions first — STOP gate (still open for this story)

The items below are **genuinely undecided**. Do not register contributions or expand host contracts until each is resolved and recorded.

1. **Canonical built-in id and contribution ids:** What stable ids should journal and calendar contributions expose? NOT yet decided. `pending-beta_builtin_extensions-med-med.md` has not yet decided canonical built-in ids and contribution ids — that blocks naming here. This is a hard STOP gate for any registration work.
2. **Activation event:** Is the journal/calendar built-in activated at startup, on first view, on command, or another trigger? The lazy-activation RISK above must be resolved first (see above). Should it be lazy?
3. **Required beta contribution table:** Which commands, panel entries, and settings schema entries are required for the beta boundary? The owning beta story (`plans/extensions/pending-beta_builtin_extensions-med-med.md`) must confirm this list.
4. **Note-template contribution:** If note templates are included in the first slice, does a platform-neutral template contract exist in `packages/core/src/contributions.ts`? If not, this story must not invent one — defer or raise.
5. **Unavailable mobile capabilities:** How should desktop-only capabilities (activity bar, panel resize) be represented in the mobile/shared-webview activation path without pretending registration equals readiness?
6. **Calendar tab contribution point:** Until a tab-kind contribution surface is designed and a prerequisite story is completed, the calendar tab cannot be wired here. Block this story's calendar registration on that prerequisite.

**STOP gate:** Do not wire built-in registration, add namespaces, or expand host contracts until the id/activation/contribution table is approved and the tab-kind contribution point exists. `pending-beta_builtin_extensions-med-med.md` must decide canonical ids first.

## Goal

Register the journal and calendar built-ins through `desktopExtensionHost` with disposable lifecycle ownership. Exactly one activity-bar entry (journal popout) enters via `context.panels.register(...)`. Calendar opens as a canvas tab from the popout — no calendar activity-bar entry, and no calendar tab registration until a contribution point exists. Editor-hook for the metadata widget enters via `context.editorHooks.register(...)` and checks both journal-folder path and frontmatter keys (D28). Settings namespaced outside the workspace; secrets deferred.

## Scope

- One built-in extension id activating both journal and calendar contributions.
- Exactly ONE activity-bar entry (journal popout); the calendar is a tab, not an activity-bar entry (D27).
- Journal popout contribution enters via `context.panels.register(...)` inside `activate()`.
- Calendar canvas tab: blocked until a tab-kind contribution point exists (see PREREQUISITE above). The file that must change is `apps/desktop/src/shell/TabContent.tsx`, plus kind registration in `apps/desktop/src/tabs/tabRegistry.ts`.
- Editor-hook registration for `MetadataWidget` enters via `context.editorHooks.register(...)` — NOT the panel registry. Tests BOTH journal-folder path AND configured frontmatter keys (D28).
- Settings namespaced as `extension-${extensionId}` in OS app-data; no workspace settings, no secrets in JSON.
- Disposable scope: all contributions deactivate on deactivation/failure/shutdown.
- Extensions are trusted same-context modules; capability declarations only — no sandbox, no isolation.
- FTS5 cache dependency: journal search depends on the indexing/search epic's FTS5 cache; register or document this dependency explicitly; cache is disposable, rebuildable, never source of truth (D16).

Deferred (do not implement here): URL install, extension signing, marketplace, strong isolation, template contribution if the platform-neutral contract is absent, calendar tab registration (blocked by missing contribution point).

## Likely files

- `apps/desktop/src/extensions/builtins/journalCalendarExtension.ts` (new built-in definition/activation adapter).
- `apps/desktop/src/extensions/builtins/journalCalendarExtension.test.ts` (new registration/lifecycle tests).
- `apps/desktop/src/extensions/builtins/index.ts` (new export/activation list entry).
- `apps/desktop/src/extensions/desktopExtensionHost.ts` and `.test.ts` (only if a missing approved contribution such as note templates requires a typed host bridge; preserve relative lowercase-kebab IDs and `extension-${extensionId}` settings namespace behavior).
- `packages/core/src/extensions/manifest.ts` (reference only; do not change unless adding a new approved manifest field).
- `packages/core/src/contributions.ts` and `contributions.test.ts` (only if a platform-neutral note-template contract/registry is approved and absent; no React/Tauri coupling).
- `apps/desktop/src/panels/panelRegistry.tsx` (consume journal panel contribution; do not add calendar here).
- `apps/desktop/src/tabs/tabRegistry.ts` — NOTE: extension `.ts`, not `.tsx` — (register calendar kind metadata ONLY; does NOT make `TabContent.tsx` render it; both files must change together).
- `apps/desktop/src/shell/TabContent.tsx` (add rendering branch for new tab kind; this is the critical file, not just `tabRegistry.ts`).
- `apps/desktop/src/settings/settingsStore.ts` and `packages/core/src/settings/modules/index.ts` (consume the approved journal settings module through the existing registry).
- `apps/desktop/src/main.tsx` — bootstrap call site; built-ins are registered via `bootstrapExtensions()` here, BEFORE `createRoot().render()`. Do not activate from multiple components.
- `apps/desktop/src/extensions/bootstrap.ts` (if bootstrap options need to expand; preserve existing eager/lazy activation logic).
- `apps/desktop/src/extensions/builtins/index.ts` and associated test (new startup/dispose coverage).

## Dependencies

- `pending-beta_builtin_extensions-med-med.md` must decide canonical ids first — hard STOP gate.
- Approved id/activation table and completed or stable journal service, panel, calendar tab, and settings contracts.
  - `pending-journal_panel_ui-high-hard.md` must be stable before journal popout contribution is registered.
  - `pending-calendar_tab_ui-high-hard.md` must be stable before calendar tab contribution is registered; a tab-kind contribution point must exist first (currently untracked).
- Lazy-activation RISK resolution (see RISK section above).
- Existing `desktopExtensionHost`, `DesktopExtensionContext`, command/panel/settings APIs, `desktopPanelRegistry`, disposable lifecycle tests.
- Indexing/search epic's FTS5 cache (D16) — explicit dependency; do not build a parallel index.
- Beta boundary: `plans/extensions/pending-beta_builtin_extensions-med-med.md`, `plans/extensions/pending-internal_contribution_points-low-med.md`, `plans/extensions/pending-extension_execution_model-low-med.md`.

## Acceptance criteria

- [ ] One canonical built-in extension id activates journal/calendar contributions through `desktopExtensionHost`; no direct registry mutation bypasses the host.
- [ ] Exactly one activity-bar entry (journal popout) is registered via `context.panels.register(...)`; no calendar activity-bar entry exists (D27).
- [ ] Journal popout contribution enters via `context.panels.register(...)` inside `activate()`.
- [ ] Editor-hook for `MetadataWidget` enters via `context.editorHooks.register(...)`, NOT the panel registry. Tests BOTH the journal-folder path AND configured frontmatter keys before activating (D28); a single-condition hook is a defect.
- [ ] Lazy-activation timing risk is resolved empirically before editor-hook code is merged (see RISK section).
- [ ] Calendar canvas tab registration is blocked until a tab-kind contribution point exists; no calendar tab wiring ships without it.
- [ ] Settings are namespaced as `extension-${extensionId}` in OS app-data; no workspace settings or secrets in JSON.
- [ ] All contributions are disposed on deactivation/failure/shutdown; deactivation does not remove other built-ins.
- [ ] Journal search dependency on the indexing/search epic's FTS5 cache is documented in code (comment or type-level dependency); the cache is never treated as source of truth.
- [ ] Mobile/shared-webview activation does not claim desktop-only capabilities; unsupported behavior follows the soft capability boundary.
- [ ] Registration collisions and missing feature dependencies fail loudly with typed/useful diagnostics.
- [ ] Integration tests cover: activation once, duplicate/canonical namespace handling, contribution lookup, failed activation cleanup, deactivation cleanup, and bootstrap unmount/shutdown.
- [ ] No duplicate path logic, metadata parsing, calendar aggregation, or UI state is introduced here.

## Tests / manual checks

- Run extension host/built-in/bootstrap tests, lint, typecheck, and full QA.
- Manual desktop: start app once, verify exactly one journal activity-bar entry appears (no calendar entry), invoke approved commands, open journal popout, open calendar tab from popout (if tab contribution point exists), change a namespaced setting, close/unmount, verify no stale registration remains.
- Manual failure case: disable/make unavailable one feature dependency; verify a clear unavailable state, not a crash or false success.
- Manual mobile: confirm the same registration path and that no desktop-only command/capability is exposed.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`). All extension host/built-in/bootstrap integration tests must pass.

## Manual desktop/mobile checks

Desktop: activate/deactivate approved built-in registrations once; verify panel, command, and settings delegation and cleanup; confirm no calendar activity-bar button. Editor hook timing: verify the metadata widget appears in an already-open editor (or confirm the activation sequence prevents this edge case). Mobile: verify registration reports unavailable desktop capabilities without crashing or assuming desktop shell.

## Non-goals

- No extension manifest loader, URL install, signing, marketplace, sandbox, or third-party extension behavior.
- No strong isolation — extensions are trusted same-context modules; capabilities are compatibility declarations only.
- No secrets in JSON settings (deferred to Rust/native secret-store story).
- No final UX decision, journal/calendar data model, Markdown format, folder/naming policy, or panel/tab implementation.
- URL install, signing, marketplace, and strong isolation remain DEFERRED.
- No `tabs` surface on `DesktopExtensionContext` — do not invent one without a separate approved story.

## Handoff artifacts

The following stories need from this one:

- Stable built-in extension id and contribution ids (needed by beta built-in extensions story and by QA) — blocked on `pending-beta_builtin_extensions-med-med.md`.
- Confirmed registration API surface: panels via `context.panels.register(...)`, editor hooks via `context.editorHooks.register(...)`.
- Confirmed tab-kind contribution point status and the files that must change (`tabRegistry.ts` + `TabContent.tsx`), once the prerequisite story exists.
- Settings namespace convention (`extension-${extensionId}`) documented for journal settings story.
- FTS5 cache dependency declaration, for the indexing/search epic to understand what the journal built-in requires.
- Lazy-activation timing risk resolution for `markdownEditorHookRegistry`.
