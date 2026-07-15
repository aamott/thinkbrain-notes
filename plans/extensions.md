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

## Scope

In scope:

- internal contribution points: command registry, activity/sidebar panel
  registration, editor command hooks, settings schema registration
- `extension.json` manifest format
- capability-based sandbox (V1: strict, no unrestricted filesystem access)
- permission declarations in the manifest
- install from URL and install from file
- extension settings (stored outside the workspace, keyed by extension id)
- third-party extension API surface: views, panels, menus, editor actions,
  settings contributions, themes, AI tools, Git tools, static registry

Non-goals (deferred or out of scope for V1):

- extension marketplace / discovery (separate `marketplace` epic)
- extension signing / trust model (may be revisited before V1 ships)
- unrestricted filesystem access for extensions (explicitly rejected for V1)
- remote/code-server extension hosting

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
native bridge capabilities) is implemented via adapters in `apps/desktop` (and
later `apps/mobile`), matching the existing hub-and-spoke rule.

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
- ⬜ Extension manifest format — `extension.json` schema and parser
- ⬜ Capability-based sandbox — V1 strict sandbox, deny-by-default, no unrestricted filesystem access
- ⬜ Extension API surface — views, panels, menus, editor actions, themes, AI/Git tool hooks, static registry
- ⬜ Install from URL — download and install an extension from a URL
- ⬜ Install from file — install an extension from a local file
- ⬜ Extension settings — per-extension settings stored outside the workspace
