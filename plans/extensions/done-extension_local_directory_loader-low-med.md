# Extension Local-Directory Loader

## Status

✅ Supported beta load path shipped for trusted local development directories. Remaining lifecycle cleanup, local panel mounting, and duplicate-id diagnostic gaps stay unchecked below; this status does not close them.

## Goal

Load a trusted development extension from an arbitrary local directory containing the approved manifest and entry module, validate it, and register it with the same-context host. Local-directory loading is the primary beta development path and must remain explicit about app privileges. Hot reload means unload/reload behavior, not a security boundary.

## Shipped loader contract and remaining gaps

- A local directory contains `extension.json` and one pre-bundled ESM entry (`main`); path validation rejects traversal and invalid entry paths.
- The loader is explicit trusted-code loading: the module runs same-context with app privileges, not in a sandbox. Compatibility errors stop loading; capability warnings are retained.
- `localExtensions` provides explicit add, remove, and remove-then-add reload behavior. Failed imports clean up their Blob URL.
- Commands and settings load from disk. Declared local panels are warned about and skipped until a framework-neutral panel mount contract ships.
- `onLanguage` remains an unsupported activation trigger, and duplicate-id diagnostics remain a host/registry gap.
- Successful unload/reload does not yet wire `revokeExtensionModule` to the lifecycle, so Blob URL cleanup remains an open gap.

## Prerequisites

- Manifest parser, compatibility evaluator, and lifecycle host.
- Approved same-context module format and loader path policy.
- Native file/path adapter conventions in `apps/desktop/src/native/` and Rust commands under `apps/desktop/src-tauri/src/`.

## Exact likely file areas

- Add `apps/desktop/src/extensions/localDirectoryLoader.ts` and tests; keep orchestration separate from `desktopExtensionHost.ts`.
- Add platform-neutral loader interfaces only if needed in `packages/core/src/extensions/loader.ts`.
- Add native directory/module metadata commands in `apps/desktop/src/native/commands.ts` and `apps/desktop/src-tauri/src/commands/` only if the approved browser/Tauri import path requires them.
- Bootstrap consumer will live in `apps/desktop/src/extensions/bootstrap.ts`, a separate story.

## Shipped implementation

1. `createLocalDirectoryLoader` injects file reading and module importing, parses and validates the manifest, evaluates compatibility, resolves the entry path, and validates the `activate` export.
2. `createDesktopLocalDirectoryLoader` reads through the native bridge and imports a self-contained entry from a Blob URL with a source URL for diagnostics.
3. `createLocalExtensions` and bootstrap own explicit remove/reload, registration replacement, activation, and contribution cleanup.
4. Tests cover valid load, entry/path/import failures, compatibility failure, malformed manifests, panel warnings/stripping, and clean local registration replacement.
5. Remaining implementation work is to connect successful lifecycle removal to Blob URL revocation and to improve duplicate-id diagnostics; do not broaden this into an installer, watcher, or marketplace path.

## Acceptance criteria

- [x] A valid local directory loads only after manifest and compatibility validation.
- [x] Entry module receives the scoped API and the trusted app-privileges boundary is documented.
- [x] Invalid paths/manifests/exports and activation failures fail loudly and leave no registrations behind.
- [x] Explicit remove/reload disposes lifecycle-owned registrations before a new instance activates.
- [x] The pre-bundled ESM/Blob URL strategy works in the desktop webview; mobile remains outside this desktop adapter.
- [ ] Successful unload/reload must still revoke the entry module's Blob URL.
- [ ] Local panel mounting and host/registry duplicate-id diagnostics remain deferred.

## Automated validation

- Loader unit tests with temporary fixture directories and fake module importer.
- Desktop integration tests for successful load, bad manifest, bad export, duplicate id, failed activation, and reload cleanup.
- `pnpm --filter @thinkbrain/desktop test -- extension`; then `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Manual desktop/mobile checks

- Desktop Tauri: choose/load a sample local directory, verify warning/status, contribution appearance, reload, and cleanup.
- Mobile Tauri: verify the loader is disabled or works through the approved shared adapter; no desktop-only path picker or watcher may crash the app.

## Non-goals

No zip/file installer, URL install, marketplace, signing, sandbox, extension UI design, or feature behavior.

## Handoff artifacts

- Loader interface/implementation, fixture extensions, path/module policy decision, reload semantics, and test report.
- Explicit list of native commands/capabilities needed by the bootstrap and file-install stories.

## References

- `plans/extensions/done-extension_manifest_format-low-med.md`
- `plans/extensions/done-extension_capability_compatibility-low-med.md`
- `plans/extensions/done-extension_lifecycle_bootstrap-low-med.md`
- `plans/extensions/pending-extension_contribution_surfaces-low-med.md` — local panels remain skipped pending a mount contract
- `plans/technical-decisions.md`
