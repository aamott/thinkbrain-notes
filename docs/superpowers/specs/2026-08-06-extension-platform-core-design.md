# Extension Platform Core — Design

**Date:** 2026-08-06
**Epic:** `plans/pending-extensions-low-hard.md`
**Stories:** `plans/extensions/pending-extension_manifest_format-low-med.md`,
`pending-extension_capability_compatibility-low-med.md`,
`pending-extension_lifecycle_bootstrap-low-med.md`

## Goal

Make an extension real end to end. The lifecycle host and the scoped
contribution surfaces already exist and are tested, but nothing in the app ever
constructs or bootstraps them — `desktopExtensionHost` is imported only by its
own test file. This work supplies the missing middle: a manifest format,
compatibility gates, a bootstrap that activates extensions lazily, and one
built-in extension that proves the whole path.

## Scope

In scope:

- `extension.json` manifest format: parser, schema, typed diagnostics.
- Soft compatibility gates: `apiVersion` semver range, platform requirements,
  declared capabilities.
- Bootstrap: wire the host into app startup, register manifest-declared
  contributions as stubs, and activate lazily on declared events.
- A **Note Stats** built-in extension exercising commands, panels, settings,
  activation, and disposal.
- Enable the existing Extensions panel and render real host state.

Deferred (each already has its own story):

- Local-directory loading of extensions from disk. Recorded decisions call this
  "the primary development path", so it is next, not dropped — but no beta
  built-in needs it, and it requires a Tauri file-reading path plus dynamic
  import of arbitrary modules under Vite.
- Events/tasks, extension data storage, secret storage, packaging, file
  installation.
- Anything marketplace-shaped. `pending-extension_deferred_distribution` says
  not to create even stubs for URL install, registry fetch, or signing.

## Non-negotiable constraints from recorded decisions

Quoted from `plans/technical-decisions.md` and the epic:

- "Capabilities are soft declarations and compatibility gates, not a security
  sandbox... must not be presented as adversarial isolation." No code comment,
  type name, or UI string may imply extensions are sandboxed.
- "Every extension activation owns a disposable resource scope." Already
  implemented; the bootstrap must not bypass it.
- Extension ids match `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`.
- Contribution points and runtime live in `packages/core` (platform-agnostic);
  platform specifics go through `apps/desktop` adapters.

## Module layout

**`packages/core/src/extensions/`** — no Tauri, no React, no DOM.

| File | Responsibility |
| --- | --- |
| `manifest.ts` | `ExtensionManifest` type and `parseExtensionManifest(value: unknown): ManifestParseResult`, returning `{ manifest, diagnostics }` — the same result shape as the existing `parseFrontmatter`, so it reads like the rest of core. |
| `compatibility.ts` | `evaluateCompatibility(manifest, host): CompatibilityResult` for apiVersion, platform, and capabilities. |
| `activation.ts` | Parsing and matching of activation events. |
| `index.ts` | Re-exports. |

**`apps/desktop/src/extensions/`**

| File | Responsibility |
| --- | --- |
| `bootstrap.ts` | Registers built-ins, installs stubs, activates lazily, disposes on shutdown. |
| `builtins/index.ts` | The built-in registry: manifest + activate function pairs. |
| `builtins/note-stats/manifest.ts` | Note Stats manifest. |
| `builtins/note-stats/extension.tsx` | Note Stats activation and panel. |
| `ExtensionsPanel.tsx` | Renders live host status. |

## Manifest

```json
{
  "id": "note-stats",
  "name": "Note Stats",
  "version": "1.0.0",
  "apiVersion": "^1.0.0",
  "engines": { "platform": ["desktop", "mobile"] },
  "activationEvents": ["onCommand:show", "onView:stats"],
  "capabilities": [],
  "contributes": {
    "commands": [{ "id": "show", "title": "Show note stats" }],
    "panels": [{ "id": "stats", "label": "Note Stats", "side": "right", "icon": "∑" }]
  }
}
```

Ids inside `contributes` are **relative** to the extension; the existing host
already prefixes them with the extension id, so the manifest must use the same
relative form the runtime APIs take. Activation events reference those same
relative ids (`onCommand:show`, not `onCommand:note-stats.show`).

Built-ins pair a manifest with a statically imported activate function, so
there is no `main` entry path to resolve yet. `main` arrives with the loader
story.

Parsing never throws. Unknown fields are preserved but ignored; invalid ones
produce diagnostics and, when fatal, a `null` manifest — matching how
frontmatter parsing already reports damage without discarding the document.

## Compatibility

`evaluateCompatibility` returns every reason it found rather than short-circuiting,
so the Extensions panel can list all problems at once:

- **apiVersion**: manifest declares a semver range; the host declares its
  version. Out-of-range is incompatible.
- **platform**: `engines.platform` lists `desktop` and/or `mobile`. A
  non-matching host is incompatible.
- **capabilities**: unknown or host-unsupported capabilities are reported as
  warnings, and the extension still loads. These are compatibility hints, not
  permissions — nothing is denied on their basis.

An incompatible extension is **registered but never activated, and never
stubbed**: it appears in the Extensions panel with its reasons so the failure is
visible rather than silent, but contributes nothing to the palette or activity
bar. A manifest that fails to parse at all is reported the same way, using its
file/registry key as the display name since its id may be the invalid part.

## Lazy activation

Activation events create a chicken-and-egg problem: `onCommand:show` cannot fire
if the command does not exist until after activation. The epic already resolves
it — "the static registry reads manifests to populate commands, panels, menus" —
so the bootstrap registers **stubs** from `contributes` before any extension
code runs.

At startup, for each compatible built-in:

1. If `onStartup` is declared, activate immediately and skip stubs.
2. Otherwise register a stub for each contributed command and panel.
   - A **stub command** disposes itself, activates the extension (which
     registers the real command under the same id), then invokes the real one.
   - A **stub panel** renders a brief loading state and triggers activation on
     first mount.

The palette and activity bar therefore look complete from the first frame, but
no extension code executes until the user touches one. Stub registration is
owned by a disposable store so shutdown cleans up both stubs and activations.

## Note Stats

The test extension. Contributes:

- **Panel** `stats` (right side) — word, character, and reading-time counts
  computed from `documentContents`, which `DesktopPanelContext` already
  supplies.
- **Command** `show` — reveals that panel.
- **Settings** `showReadingTime` (boolean, default true) and `wordsPerMinute`
  (number, default 200), registered through the existing namespaced schema API.

It deliberately contributes **no editor hook**: nothing it does needs one, and
adding one purely to touch the surface would be theatre. Editor hooks stay
covered by the live-preview hook and the hook registry's own tests.

## Extensions panel

The panel already exists but is `availability: () => false` and renders copy
promising it will appear "when the capability sandbox is ready" — which
contradicts the recorded decision that there is no sandbox in beta. Enable it,
correct the copy, and render real data from `desktopExtensionHost.statuses()`:
id, name, status, and any compatibility reasons.

This is what makes lazy activation observable: Note Stats reads `registered`
until its panel is opened, then flips to `active`.

## Testing

- **Pure units**: manifest parsing (valid, malformed, missing fields, bad id,
  wrong types), compatibility evaluation, activation-event matching.
- **Bootstrap**: stubs registered before activation; invoking a stub command
  activates exactly once and runs the real handler; concurrent invocations
  activate once; shutdown disposes stubs and active extensions.
- **Note Stats**: counts are correct, including for an empty document and one
  with frontmatter; settings changes are reflected.
- **E2E**: open the Extensions panel, see Note Stats `registered`, open its
  panel, see it become `active` and show a count.

## Risks

- The stub-command handoff is the subtle part: a stub must not leak if
  activation fails, and must not double-register. Failure has to leave the
  extension `failed` and the stub removed, not a half-registered command.
- Enabling the Extensions panel changes the activity bar for every user; that
  is intended but visible.
