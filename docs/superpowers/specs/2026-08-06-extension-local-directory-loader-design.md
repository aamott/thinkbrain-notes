# Extension Local-Directory Loader — Design

**Date:** 2026-08-06
**Epic:** `plans/pending-extensions-low-hard.md`
**Story:** `plans/extensions/pending-extension_local_directory_loader-low-med.md`

## Goal

Load a trusted extension from a local directory on disk. Today built-ins ship as
app code and nothing loads from a filesystem path at all;
`bootstrapExtensions` takes a static `readonly BuiltInExtension[]`. Recorded
decisions call local-directory loading "the primary development path", so this
story supplies the missing piece: read a directory, validate it, import its
entry module, and hand the result to the same lifecycle machinery built-ins
already use.

## Scope

In scope:

- An optional `main` field in the manifest, naming the entry module.
- Pure directory/entry/export validation in `packages/core`.
- A desktop loader that reads the directory through a native command, imports
  the entry module, and registers it with the existing host.
- Explicit unload and reload, disposing everything the activation owned.
- Subscription support on contribution registries, so a contribution registered
  after startup actually appears.
- Extensions-panel UI to add, remove, and reload a development directory, with
  an app-privileges warning.

Deferred (each already has its own story):

- Panels contributed from disk — see "Contribution surfaces" below.
- Zip/archive packaging, install-from-file, install-from-URL, marketplace,
  signing. `pending-extension_deferred_distribution` forbids even stubs.
- File watching. Reload is a manual, explicit action.

## Non-negotiable constraints from recorded decisions

- "Capabilities are soft declarations and compatibility gates, not a security
  sandbox... must not be presented as adversarial isolation." Nothing in this
  work may imply a loaded extension is contained. It runs with full app
  privileges and the UI must say so plainly.
- "Every extension activation owns a disposable resource scope." Unload and
  reload go through that scope; the loader adds no parallel cleanup path.
- Contribution points and runtime live in `packages/core`; platform specifics go
  through `apps/desktop` adapters. The loader's I/O is injected, not imported.

## Module format

A development extension is a directory:

```text
my-extension/
  extension.json     # required
  extension.js       # required; name overridable via manifest "main"
```

The entry is a **single pre-bundled ESM file** with no imports. The loader reads
it as text, appends a `//# sourceURL=<absolute path>` comment so stack traces
and devtools name the real file, wraps it in a `Blob`, and dynamically imports
the resulting object URL.

The entry must provide a named export `activate`, and may provide `deactivate`.
Both take the same `DesktopExtensionContext` that built-ins already receive, so
there is exactly one extension API rather than one for app code and another for
disk:

```js
export function activate(context) {
  context.subscriptions.add(
    context.commands.register({ id: "greet", title: "Greet", handler: () => {} })
  );
}
```

### Why blob URLs rather than the asset protocol

Tauri's `asset:` protocol is the obvious alternative, and there is precedent for
it here — `workspace.rs` already calls `app.asset_protocol_scope().allow_directory()`
and `native/assets.ts` already uses `convertFileSrc`. Its advantage is that
relative imports inside the extension directory keep resolving, allowing
multi-file extensions.

That advantage is exactly what breaks reload. If `extension.js` imports
`./util.js`, cache-busting `extension.js?v=2` does not evict `./util.js` from
the ESM module registry; a reload would run new top-level code against a stale
submodule graph. The story requires that "unload/reload disposes lifecycle-owned
resources before a new instance activates", and a partially-stale graph does not
satisfy that.

A single-file bundle behind a blob URL has exactly one module, so a fresh blob
is unconditionally a fresh instance. The cost is that authors must bundle, which
is an ordinary expectation and keeps the runtime contract small. The same
mechanism works unchanged in the mobile webview.

Blob URLs are revoked on unload. `csp` is `null` in `tauri.conf.json`, so no
policy blocks the import.

## Contribution surfaces

A disk extension may contribute **commands and settings**. A `contributes.panels`
entry in a disk manifest produces a warning diagnostic, is not stubbed, and does
not prevent the extension from loading.

The reason is React identity, not policy. `DesktopPanelContribution.factory`
returns a `ReactNode`; a bundled extension that imports React gets a second copy
of the library, and hooks break across that boundary. Supporting panels properly
means a framework-neutral DOM-mount contract — the extension receives an element
and owns what goes in it — which is a public API that will have to be supported
indefinitely. That belongs to
`plans/extensions/pending-extension_contribution_surfaces-low-med.md`, designed
on its own terms. Improvising it inside the loader story would be the least
maintainable outcome available.

Built-ins keep the existing React panel API. They are app code, share the app's
React instance, and are unaffected.

## Registry reactivity

`createContributionRegistry` in `packages/core/src/contributions.ts` currently
exposes `register`, `get`, and `entries()`, where `entries()` returns a fresh
defensive copy on every call. Nothing subscribes. The bootstrap works today only
because it completes before the first React render, which is also why a stub and
its real counterpart must share id, label, icon, and side — so the rendered list
never changes shape.

A loaded extension cannot honour that: it arrives while the app is running. Its
command would register successfully and remain invisible until an unrelated
re-render. So the registry gains:

- `subscribe(listener: () => void): () => void`
- a cached `entries()` snapshot, rebuilt only on change, so the reference is
  stable between renders and `useSyncExternalStore` does not loop.

Five call sites move to hooks over that subscription: `ActivityBar`,
`TitleBar`, `LeftPopout`, `RightPopout` (all via
`getLeftPanelContributions` / `getRightPanelContributions`), and `DesktopShell`
(via `desktopCommandRegistry.entries()`).

This also retires the ordering constraint that previously caused a startup
crash: bootstrap no longer *has* to precede the first render for contributions
to appear. The `bootstrapRef.ts` indirection stays, since the circular import it
solved is unrelated.

This part is independently useful and ships first, on its own.

## Path policy and native access

Only absolute directory paths, chosen through a native picker. There is no
configured development root and no relative path resolution — a development root
would be a second path policy to maintain and would invite the "permissive
shortcut" the story explicitly forbids.

Two small native additions:

- `pickDirectoryPath(title)` in `apps/desktop/src/native/dialogs.ts` — the
  existing `pickFilePath` with `directory: true`, same `isTauri()` guard and
  `null`-on-cancel contract.
- `read_extension_file(directory, relative_path)` in a new
  `apps/desktop/src-tauri/src/commands/extensions.rs`, wrapped by
  `readExtensionFileNative` in `apps/desktop/src/native/commands.ts`.

The Rust command is modelled on the existing `read_theme_file` but stricter.
`read_theme_file` takes a bare absolute path and documents that it bypasses the
FS plugin scope; the new command takes a directory plus a relative path,
canonicalises both, and verifies the resolved file is still inside the
canonicalised directory. It is modelled on the `normalize_relative_path` and
`resolve_workspace_entry_path` helpers in `workspace.rs` — same rejection of
absolute paths, `..`, and prefix components, same canonicalise-then-compare
containment check — but is written against an extension directory rather than a
workspace root, since those helpers are specific to workspace scoping. Symlinks
that escape the directory fail the check, because canonicalisation resolves them
before comparison.

Chosen directories persist in app settings as a list of absolute paths, under
the existing JSON settings registry — outside the workspace, per the storage
rule.

## Loader structure

**`packages/core/src/extensions/loader.ts`** — pure, no I/O, no Tauri, no DOM.

| Export | Responsibility |
| --- | --- |
| `resolveEntryPath(manifest)` | `manifest.main ?? "extension.js"`, rejecting absolute paths, `..` segments, and extensions other than `.js`/`.mjs`. |
| `validateExtensionModule(value)` | Confirms the imported namespace exports a callable `activate` and, if present, a callable `deactivate`. |
| `LoadDiagnostic`, `LoadResult` | The same `{ code, message, severity }` diagnostic shape the manifest parser already returns. |

**`apps/desktop/src/extensions/localDirectoryLoader.ts`** — orchestration.

```ts
createLocalDirectoryLoader({
  readFile: (directory: string, relativePath: string) => Promise<string | null>,
  importModule: (code: string, sourceUrl: string) => Promise<unknown>
})
```

Both dependencies are injected. Production passes `readExtensionFileNative` and
a blob-URL importer; tests pass fixture strings and a fake importer, so the
loader's own tests need neither Tauri nor a real filesystem. This is the main
reason for the split.

Load sequence, stopping at the first failure and reporting every diagnostic
gathered so far:

1. Read `extension.json`; parse as JSON; `parseExtensionManifest`.
2. `evaluateCompatibility` against the same host descriptor the bootstrap uses.
3. `resolveEntryPath`; read the entry file.
4. Import it; `validateExtensionModule`.
5. Reject a duplicate id against already-registered extensions.
6. Hand `{ manifest, activate }` — a `BuiltInExtension`-shaped record — to the
   bootstrap, which registers command stubs and activates lazily exactly as it
   does for built-ins. Declared panels are skipped with a warning, per
   "Contribution surfaces" above.

The bootstrap's `DEFAULT_COMPATIBILITY_HOST` is currently module-private; it
becomes exported so the loader gates against the same host descriptor rather
than a second copy that could drift.

Failure at any step leaves nothing registered and no blob URL alive. This is the
story's "fail loudly and leave no registrations behind" criterion, and it is
tested per step rather than in aggregate.

## Unload and reload

Unload disposes the extension's registration handle, which disposes the
activation scope and with it every command, panel, setting, and subscription the
extension owned; then revokes the blob URL and drops the entry from the
bootstrap's state.

Reload is unload followed by load, in that order, never overlapping. A changed
manifest needs no special case: the manifest is re-read from disk and a fresh
blob is minted, so it is the same path. Reload is triggered explicitly from the
Extensions panel. There is no watcher — that is more machinery, another
capability, and a debounce policy to tune, for a manual action a developer takes
deliberately.

If a reload fails, the extension is left unloaded with its diagnostics visible,
not half-registered against a stale module.

## Extensions panel

The panel gains an "Add development extension…" action that picks a directory,
shows a confirmation naming the directory and stating that the extension runs
with full application privileges — no sandbox language, per the recorded
decision — and then loads it. Each loaded entry gains reload and remove actions,
its directory path, and a persistent marker distinguishing it from a built-in.

Loaded extensions appear in the same list, driven by the existing
`ExtensionBootstrap.subscribe` and `useSyncExternalStore` wiring, so status
transitions are live without further work.

## Testing

- **Pure units** (`packages/core`): entry-path resolution including traversal and
  bad extensions; module-export validation; registry subscribe/snapshot
  stability, and that `entries()` keeps a stable reference until a change.
- **Loader** (`apps/desktop`, fake `readFile` + `importModule`): success; missing
  directory; unreadable manifest; invalid JSON; failing manifest parse;
  incompatible manifest; missing entry file; entry that throws at import; entry
  with no `activate`; `activate` not callable; duplicate id; failed activation.
  Each asserts that nothing remains registered.
- **Reload**: registrations from the first load are gone before the second
  activates; a changed manifest takes effect; a failing reload leaves the
  extension unloaded rather than half-registered.
- **Shell**: a command registered after first render appears in the palette; a
  panel registered after first render appears in the activity bar.
- **E2E**: load a fixture extension from a temporary directory, see it in the
  Extensions panel, invoke its command from the palette, reload it, remove it,
  and confirm its command is gone from the palette.

Fixtures live in the repository under the desktop package, not at a developer
machine path.

## Sequencing

Three commits, each independently green:

1. **Registry reactivity.** `subscribe` plus cached snapshot in
   `packages/core/src/contributions.ts`; the five shell call sites move to
   hooks. Ships alone and changes no behaviour.
2. **Loader and native plumbing.** Manifest `main`, `packages/core` loader,
   `read_extension_file`, `pickDirectoryPath`, `localDirectoryLoader.ts`,
   bootstrap support for dynamic add/remove/reload. No UI.
3. **Panel UI and e2e.** Add/reload/remove actions, the privileges warning,
   persisted directories, fixtures, and the end-to-end test.

## Risks

- **Blob-imported code cannot be un-imported.** Revoking the object URL frees
  the blob, but a module already evaluated stays in memory, and anything it
  captured outside the disposable scope — a stray `setInterval`, a global
  listener — survives unload. The disposable scope covers everything registered
  *through the API*; it cannot cover what an extension does behind the API's
  back. This is inherent to trusted same-context execution and should be
  documented, not papered over.
- **Reload leaks are silent.** If an extension's registrations are not fully
  disposed, the symptom is a duplicate-id error on the next load, which is at
  least loud. The test asserting registrations are gone before re-activation is
  the real guard.
- **Registry reactivity touches shell rendering.** Five call sites change how
  they read contributions. The change is mechanical, but it is on the app's main
  render path, and unit tests alone would not have caught the analogous problem
  last time — the browser did. This one needs a real run, not just green tests.
