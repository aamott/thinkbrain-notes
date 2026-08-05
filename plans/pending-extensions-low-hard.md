# Extensions

> Extension system: internal contribution points, a third-party extension API,
> and a capability-based sandbox. This is a **future epic** (low urgency, not yet
> started). Read `plans/app-vision.md` and `plans/technical-decisions.md`
> (Extensions section) before starting any story here.

## Goal

Make the app extensible without compromising the local-first, privacy-first, and
"your files stay plain Markdown" principles. Start with internal contribution
points (already partially designed), then add a manifest format, a
capability-based sandbox, and install flows so third-party extensions can run
safely. Extension settings integrate with the existing JSON settings system.

Target extension use cases that shape the API design:

- **Git sync** (manual and automatic): file watching, background sync tasks,
  conflict detection, merge UI. Includes autosync with conflict resolution for
  OneDrive, SyncThing, and other cloud drives that create duplicate files.
- **ACP Agent Chat**: network access, streaming chat UI, credential storage,
  panel registration. Built-in ACP host runtime in Rust; provider/model
  configuration and chat UI delivered as an extension.
- **Journal/calendar**: activity bar entries, popout panels, note templates,
  workspace-scoped settings.

These use cases drive the capability set, event types, and API surface. The
extension system must support them without special-casing.

## Scope

In scope:

- internal contribution points: command registry, activity/sidebar panel
  registration, editor command hooks, settings schema registration
- extension execution model: same-context JS modules with capability-gated
  Tauri commands (no iframe/process isolation in V1)
- extension activation lifecycle: lazy activation via declared events
  (onStartup, onCommand, onView, onLanguage)
- extension event system: typed pub/sub for app events (note.opened,
  file.saved, workspace.switched) and extension-emitted events
- `extension.json` manifest format (with activation events, apiVersion,
  packaging format)
- extension packaging format: directory with `extension.json` + JS entry;
  zip for distribution; dev mode loads from local directory
- capability-based sandbox (V1: strict, no unrestricted filesystem access)
- permission declarations in the manifest
- install from URL and install from file
- extension settings (stored outside the workspace, keyed by extension id)
- third-party extension API surface: views, panels, menus, context menus,
  editor actions, settings contributions, themes, AI tools, Git tools,
  background tasks, extension data storage, event system, static registry
- API versioning: manifest declares `apiVersion`; app supports a semver range
- platform-aware capabilities: desktop-only capabilities (terminal,
  process-spawn) are silently unavailable on mobile; manifests can declare
  platform requirements

Non-goals (deferred or out of scope for V1):

- extension marketplace / discovery (separate `marketplace` epic)
- extension signing / trust model (may be revisited before V1 ships)
- unrestricted filesystem access for extensions (explicitly rejected for V1)
- remote/code-server extension hosting
- iframe or process isolation for extension execution (deferred to V2 if
  the threat model demands it; V1 uses same-context + capabilities)
- extension-to-extension direct communication (V1: indirect via commands)

## Architecture Decisions

### Internal contribution points first

MVP already supports internal contribution points only. This epic formalizes
them (command registry, panel registration, editor hooks, settings schema
registration) as the same surface third-party extensions will later use, so
built-in features and extensions share one contribution model.

### Capability-based sandbox

V1 uses a strict capability-based sandbox. Extensions declare the capabilities
they need in their manifest; the app grants only those. No unrestricted
filesystem access. Third-party extension execution requires the sandbox to be
in place before any install-from-URL/file story is considered done.

### Manifest-driven

Each extension ships an `extension.json` manifest declaring id, version,
capabilities, contribution points, and entry points. The static registry reads
manifests to populate commands, panels, menus, etc.

### Settings integration

Extension settings are the third settings level (after application and
workspace settings). They live in the OS application-data/config area, keyed by
extension id, and never inside the workspace. This aligns with the existing
settings decision in `plans/technical-decisions.md`.

### Hub and spoke

Extension contribution points and the extension runtime live in
`packages/core` (platform-agnostic). Platform-specific activation (e.g. Tauri
native bridge capabilities) is implemented via adapters in `apps/desktop`,
matching the existing hub-and-spoke rule. Mobile is a Tauri Mobile build target
of `apps/desktop/` (same webview, same adapters) — there is no separate
`apps/mobile/` directory.

### Execution model: same-context JS modules

Extensions run as JavaScript modules in the Tauri webview (same context as the
app). Security is provided by the capability system — extensions can only
invoke Tauri commands they have capabilities for. No iframe or process
isolation in V1. This gives extensions full React access for UI contributions
and keeps the architecture simple. Iframe/process isolation is deferred to V2
if the threat model demands it.

Same model applies on mobile (Tauri mobile is also a webview). The capability
set is platform-aware: some capabilities (e.g. `terminal`, `process-spawn`)
are desktop-only and silently unavailable on mobile. Extension manifests can
declare platform requirements via `engines.platform`.

### Lazy activation

Extensions declare activation events in their manifest (e.g. `onCommand`,
`onView`, `onLanguage`, `onStartup`). The extension runtime only loads and
activates an extension when one of its declared events fires. This prevents
all extensions from loading on startup and keeps the app fast.

### API versioning

The manifest declares an `apiVersion` (semver). The app supports a range of
API versions. Breaking API changes require a major version bump. Outdated
extensions get a deprecation warning, not a silent failure.

## Prerequisites / Dependencies

This epic is a **prerequisite** for:

- `ai` — the AI provider abstraction depends on the extension API to register
  AI tools/providers as extensions.
- `marketplace` — extension discovery and install depends on the manifest
  format, sandbox, and install flows defined here.

This epic itself has no hard blocking prerequisites, but it assumes the
internal contribution points (command registry, panel registration, editor
hooks) are in place from earlier MVP/follow-up work (e.g. `ui-shell`). If those
are not yet formalized, the first story here should establish them.

## Validation

- Unit tests for manifest parsing and capability validation.
- Unit tests for the sandbox permission checks (deny-by-default).
- `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Manual: install a sample extension from file and URL, verify it only accesses
  granted capabilities, verify settings persist outside the workspace.

## Status

- ⬜ Internal contribution points — command registry, panel registration, editor hooks, settings schema registration
- ⬜ Extension execution model — same-context JS modules, runtime lifecycle, capability-gated commands
- ⬜ Extension manifest format — `extension.json` schema, parser, activation events, apiVersion
- ⬜ Extension packaging format — directory structure, zip distribution, dev mode
- ⬜ Capability-based sandbox — V1 strict sandbox, deny-by-default, no unrestricted filesystem access
- ⬜ Extension API surface — views, panels, menus, context menus, editor actions, themes, AI/Git tool hooks, background tasks, data storage, event system, static registry
- ⬜ Install from URL — download and install an extension from a URL
- ⬜ Install from file — install an extension from a local file
- ⬜ Extension settings — per-extension settings stored outside the workspace
