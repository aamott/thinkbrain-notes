# Extensions

> Extension system: internal contribution points and trusted local modules. This is
> a **future epic** (low urgency; implementation is in progress, with internal
> contribution points partially complete). Read `plans/app-vision.md` and
> `plans/technical-decisions.md` (Extensions section) before starting any story
> here. The foreseeable beta favors maintainability and easy development over
> hostile-extension isolation.

## Goal

Make the app extensible without compromising the local-first, privacy-first, and
"your files stay plain Markdown" principles. Start with internal contribution
points (already partially designed), then add a manifest format, trusted
same-context module loading, and lifecycle management. Built-ins ship first;
third-party extension safety is not the beta goal. Extension settings integrate
with the existing JSON settings registry through namespaced APIs.

Target extension use cases that shape the API design:

- **Git sync** (manual and automatic): file watching, background sync tasks,
  conflict detection, merge UI. Includes autosync with conflict resolution for
  OneDrive, SyncThing, and other cloud drives that create duplicate files.
- **ACP Agent Chat**: network access, streaming chat UI, credential storage,
  panel registration. Built-in ACP host runtime in Rust; provider/model
  configuration and chat UI delivered as an extension.
- **Journal/calendar**: journal popout, calendar tab, React editor-header contribution, and app/workspace-scoped settings.

These use cases drive the capability declarations, compatibility gates, event
types, and API surface. The extension system must support them without
special-casing.

## Beta built-in extensions

Built-ins ship before any third-party distribution story and use the same
contribution/lifecycle APIs as future local extensions. This epic owns only the
extension boundary and registration; feature behavior remains in the existing
epics:

- **Journal/calendar** — one journal panel/activity entry, calendar tab, D44 editor-header widget, and D45 app/workspace settings. Templates are out by D21; feature behavior and Markdown storage remain in its epic.
- **Git sync** — built-in sync/background-task registration only. Git operations,
  file watching, conflict handling, and sync UX remain owned by
  `plans/wip-git-integration-high-hard.md` and its child stories.
- **ACP Agent Chat** — built-in assistant contribution and scoped credential/API
  boundary. ACP host lifecycle, chat UI, permissions, and provider behavior
  remain owned by `plans/wip-ai-low-hard.md` and `plans/ai/`.

No beta built-in receives a third-party-install path or a separate privilege
model; each runs as trusted app code in the same context.

## Scope

In scope:

- internal contribution points: command registry, activity/sidebar panel
  registration, editor command hooks, settings schema registration
- extension execution model: trusted same-context JS modules (no
  iframe/process isolation in beta)
- extension activation lifecycle: eager startup or lazy activation via the
  supported declared events, with disposable ownership and automatic cleanup on
  deactivate/unload/failure (`onStartup`, `onCommand:<id>`, `onView:<id>`).
  `onLanguage` remains an unsupported, warning-only manifest event until a trigger
  point exists.
- extension event system: typed pub/sub for app events (note.opened,
  file.saved, workspace.switched) and extension-emitted events
- `extension.json` manifest format (with activation events, apiVersion,
  packaging format, and soft capability declarations)
- extension packaging contract: directory with `extension.json` + JS entry and
  optional assets/themes; local-directory development loading is a separate
  loader story, and install-from-file is later with an app-privileges warning
- compatibility gates for declared capabilities and platform requirements (not
  a security sandbox)
- extension-scoped, namespaced non-secret app/workspace settings through the shared
  JSON registry outside the vault (D45); secret storage through Rust/native adapters with
  no raw/bulk cross-extension reads. An encrypted app-data fallback decision is
  deferred.
- install from file (later, with a trusted-code warning)
- third-party extension API surface: views, panels, menus, context menus,
  editor actions, settings contributions, themes, AI tools, Git tools,
  background tasks, extension data storage, event system, static registry; the
  oversized API rollup is split into focused contribution, event/task, storage,
  and feature-hook stories listed below
- API versioning: manifest declares `apiVersion`; beta accepts only `*`, exact
  `x.y.z`, `^x.y.z`, or `~x.y.z`. Other ranges are incompatible.
- platform-aware capabilities: desktop-only capabilities (`terminal`,
  `process-spawn`) are unavailable on mobile and surface soft compatibility
  warnings; manifests can declare platform requirements

Non-goals (deferred or out of scope for V1):

- install-from-URL (deferred)
- extension signing, marketplace/discovery, and a stronger trust model (separate
  future work; not beta prerequisites)
- hostile-extension isolation via iframe/process sandboxing (deferred unless the
  threat model changes)
- remote/code-server extension hosting
- extension-to-extension direct communication (indirect APIs only unless a
  later decision adds a broker)

## Architecture Decisions

### Internal contribution points first

MVP already supports internal contribution points only. This epic formalizes
them (command registry, panel registration, editor hooks, settings schema
registration) as the same surface third-party extensions will later use, so
built-in features and extensions share one contribution model.

Tab kinds are contributed the same way. `apps/desktop/src/tabs/tabRegistry.ts` exports
`desktopTabRegistry` as an app-wide singleton whose `DesktopTabView` entries carry an
optional renderer `factory`, plus `subscribe()` so the shell re-renders on registration and
`Disposable` registration so a deactivating extension's kinds disappear.
`DesktopExtensionContext.tabs.register()` contributes a kind and `openTab(kind, title)`
opens one. Built-in kinds deliberately stay shell-drawn — the editor needs document state
the generic `DesktopTabContext` (`rootPath`, `tabId`) does not carry — so a contributed kind
must bring its own `factory`.

### Soft capability declarations

Capabilities are typed, manifest-declared compatibility gates and documentation,
not a security sandbox. The runtime may disable unsupported commands or warn
when a capability is unavailable, including on mobile, but a loaded extension is
trusted local code with app privileges. Do not claim that capability checks
provide hostile-extension isolation.

### Manifest-driven

Each extension ships an `extension.json` manifest declaring id, version,
capabilities, contribution points, and entry points. Extension ids are canonical
lowercase kebab-case values matching `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`; dotted,
uppercase, and underscore forms are invalid. D47 reserves beta built-in ids
`journal-calendar`, `git`, and `agent-chat`; relative semantic ids are host-prefixed.
The static registry reads manifests to populate commands, panels, menus, etc.

### Settings and credentials integration

Non-secret extension settings reuse the JSON registry through namespaced app/workspace APIs (D45). Values live in OS app-data/config, never in the vault, and extensions read/write only their own namespace and active workspace scope. Credentials never live in JSON: Rust/native code uses OS credential-
store adapters. An encrypted app-data fallback requires a separate security
decision and is explicitly deferred. APIs expose scoped operations and never
bulk/raw cross-extension secrets.

### Hub and spoke

Extension contribution points and the extension runtime live in
`packages/core` (platform-agnostic). Platform-specific activation (e.g. Tauri
native bridge capabilities) is implemented via adapters in `apps/desktop`,
matching the existing hub-and-spoke rule. Mobile is a Tauri Mobile build target
of `apps/desktop/` (same webview, same adapters) — there is no separate
`apps/mobile/` directory.

### Execution model: trusted same-context JS modules

Extensions run as trusted JavaScript modules in the Tauri webview (same context
as the app). This is intentionally not a security boundary: extensions run
with app privileges, and local-directory development loading should be easy to
use. No iframe or process isolation is planned for the beta. Later
install-from-file must warn clearly that the package runs with app privileges.

The same model applies on mobile (Tauri mobile is also a webview). Manifest
capabilities and `engines.platform` declarations are compatibility gates; the
runtime may disable or warn about desktop-only features such as `terminal` and
`process-spawn`, but must not describe that as adversarial isolation.

Each activation receives a disposable ownership scope. Registrations, event
subscriptions, timers, file watchers, background tasks, and native handles are
owned by that scope and automatically cleaned up on deactivate, unload, or
failed activation.

### Lazy activation

Extensions declare activation events in their manifest (`onStartup`,
`onCommand:<id>`, or `onView:<id>`). The extension runtime only loads and
activates an extension when one of its supported declared events fires. The
manifest may retain `onLanguage:<language>` with a warning, but no trigger point
exists yet. This prevents unrelated extensions from loading on startup and keeps
the app fast.

### API versioning

The manifest declares an `apiVersion`. Beta compatibility supports only `*`,
exact `x.y.z`, `^x.y.z`, and `~x.y.z`; any other range is incompatible rather than
silently guessed. Breaking API changes require a major version bump. An
incompatible extension is listed with an explicit diagnostic and contributes
nothing.

## Prerequisites / Dependencies

This epic provides the extension boundary for:

- `ai` — third-party providers/agents may later register through this API, while
  built-in ACP Agent Chat remains owned and deliverable in `wip-ai`/`plans/ai/`.
- `marketplace` — future discovery and signing work may consume the manifest and
  packaging decisions, but marketplace and URL-install work are explicitly
  deferred from the beta.

Built-in journal/calendar and Git sync features likewise keep their behavior in
their existing epics; this epic owns only their extension registrations.

Focused follow-up stories:

- `plans/extensions/done-extension_manifest_format-low-med.md` — shipped manifest
  parser/schema and typed diagnostics.
- `plans/extensions/done-extension_capability_compatibility-low-med.md` — shipped
  soft capability/API/platform compatibility results; not a security sandbox.
- `plans/extensions/done-extension_local_directory_loader-low-med.md` — shipped
  trusted local-directory module loading and reload semantics; Blob URL cleanup remains open.
- `plans/extensions/done-extension_lifecycle_bootstrap-low-med.md` — shipped
  manifest runtime, startup/command/view activation, desktop bootstrap, and shutdown;
  `onLanguage` remains unsupported.
- `plans/extensions/pending-extension_api_surface-low-hard.md` — superseded
  rollup; its focused contribution, event/task, storage, and AI/Git-hook child
  stories own implementation.
- `plans/extensions/pending-extension_contribution_surfaces-low-med.md` — typed
  views, menus, context menus, editor actions, and themes.
- `plans/extensions/pending-editor_header_contribution-high-med.md` — D44 observable
  React slot above the editor body; distinct from CodeMirror hooks.
- `plans/extensions/pending-extension_events_tasks-low-med.md` — app/extension
  events and abortable background tasks.
- `plans/extensions/pending-extension_data_storage-low-med.md` — extension-owned
  app-data storage and cleanup.
- `plans/extensions/pending-extension_feature_hooks-low-med.md` — AI/Git hook
  seams only; feature behavior remains in owning epics.
- `plans/extensions/pending-extension_settings-low-med.md` — D45 app/workspace scope,
  settings UI/persistence, and cleanup; app-scoped runtime is already partial and tested.
- `plans/extensions/pending-extension_secret_storage-med-hard.md` — native OS
  credential-store boundary; encrypted app-data fallback remains undecided.
- `plans/extensions/pending-extension_packaging_format-low-easy.md` — directory
  and future archive contract, without installation.
- `plans/extensions/pending-extension_file_installation-low-med.md` — later local
  package installation with an app-privileges warning.
- `plans/extensions/pending-beta_builtin_extensions-med-med.md` — registration
  boundaries for journal/calendar, Git sync, and ACP Agent Chat; behavior stays
  in the existing feature epics.
- `plans/extensions/pending-extension_deferred_distribution-low-med.md` — explicit
  URL/marketplace/signing deferral and reopen gate.

The internal contribution implementation and lifecycle/scoped-settings work are
usable prerequisites for these stories. Secret storage also depends on the
native gateway boundaries in `plans/wip-ai-low-hard.md`; built-in registrations
consume the existing feature epics rather than blocking their behavior work.

This epic itself has no hard blocking prerequisites, but it assumes the
internal contribution points (command registry, panel registration, editor
hooks) are in place from earlier MVP/follow-up work (e.g. `ui-shell`). If those
are not yet formalized, the first story here should establish them.

## Validation

- Unit tests for manifest parsing, compatibility-gate evaluation, lifecycle
  ownership, and automatic cleanup.
- Tests for namespaced settings and OS secret-store adapters; no test may expose
  bulk/raw cross-extension secrets. Encrypted fallback behavior is not tested
  until its separate security decision is approved.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Manual: load a sample local-directory extension, verify built-in contributions
  and cleanup, and verify that later file installation presents the app-
  privileges warning. URL installation is deferred.

## Status

- ✅ Internal contribution points — core command, panel, editor-hook, and
  settings-schema contracts/bridges are implemented and tested; follow-up review
  notes remain in `plans/extensions/pending-internal_contribution_points-low-med.md`.
- ✅ Contributed tab kinds — `desktopTabRegistry` singleton with renderer `factory`,
  `subscribe`, and disposable registration; `DesktopExtensionContext.tabs.register()` and
  `openTab(kind, title)`. Built-in kinds remain shell-drawn by design.
- 🟨 Lifecycle/disposable ownership and scoped settings runtime are implemented
  and tested. Manifest parsing, compatibility evaluation, local-directory loading,
  and bootstrap are shipped for the trusted beta path; remaining gaps are
  unsupported `onLanguage`, duplicate-id diagnostics, successful local Blob URL
  cleanup, and local panel mounting.
- ✅ Manifest parser/schema — `plans/extensions/done-extension_manifest_format-low-med.md`.
- ✅ Soft capability/API/platform compatibility —
  `plans/extensions/done-extension_capability_compatibility-low-med.md`.
- ✅ Local-directory loader —
  `plans/extensions/done-extension_local_directory_loader-low-med.md`. A
  directory holding `extension.json` plus a single pre-bundled ESM entry loads,
  activates lazily, reloads, and unloads from the Extensions panel. Disk
  extensions contribute commands and settings; declared panels are reported and
  skipped until `pending-extension_contribution_surfaces` defines a
  framework-neutral mount contract. Directory persistence across restarts is
  `plans/extensions/pending-local_extension_directory_persistence-low-easy.md`.
- ✅ Lifecycle/bootstrap integration —
  `plans/extensions/done-extension_lifecycle_bootstrap-low-med.md`. Built-ins are
  registered from manifests at startup and activated lazily via contribution
  stubs; `note-stats` is the first built-in and exercises commands, panels, and
  namespaced settings.
- ⬜ API/event/background-task/data surfaces —
  `plans/extensions/pending-extension_api_surface-low-hard.md`.
- ⬜ D44 React editor-header contribution —
  `plans/extensions/pending-editor_header_contribution-high-med.md`.
- ⬜ D45 app/workspace settings UI/persistence/uninstall —
  `plans/extensions/pending-extension_settings-low-med.md`.
- ⬜ Native secret storage — `plans/extensions/pending-extension_secret_storage-med-hard.md`;
  encrypted app-data fallback remains an explicit unmade security decision.
- ⬜ Packaging contract — `plans/extensions/pending-extension_packaging_format-low-easy.md`.
- ⬜ File installation — `plans/extensions/pending-extension_file_installation-low-med.md`;
  later trusted-package path with an explicit app-privileges warning.
- ⬜ Beta built-in registration boundaries —
  `plans/extensions/pending-beta_builtin_extensions-med-med.md`; journal/calendar,
  Git, and AI behavior remains in the owning epics.
- 🚫 URL/marketplace/signing/distribution — explicitly deferred; see
  `plans/extensions/pending-extension_deferred_distribution-low-med.md`. Do not
  implement in beta.
