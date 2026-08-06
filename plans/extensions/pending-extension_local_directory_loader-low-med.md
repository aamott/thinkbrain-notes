# Extension Local-Directory Loader

## Status

⬜ Not implemented. `apps/desktop/src/extensions/` currently exposes only the in-memory host; no manifest/file loader exists.

## Goal

Load a trusted development extension from an arbitrary local directory containing the approved manifest and entry module, validate it, and register it with the same-context host. Local-directory loading is the primary beta development path and must remain explicit about app privileges. Hot reload means unload/reload behavior, not a security boundary.

## Discovery questions

- Should the loader accept an absolute path only, or permit a configured relative development root?
- Which module formats are supported in the Tauri webview (ES module, bundled UMD, import map), and who bundles a source extension?
- Is hot reload automatic via watcher, manual reload command, or both?
- Should a changed manifest require a full unload/reload, and what happens to unsaved extension UI state?
- What user confirmation is required before loading an arbitrary local path in development?

**Stop-and-ask gate:** Do not implement module import, watcher behavior, path policy, or reload UX until these questions are answered. Never implement a permissive path shortcut that bypasses the trusted-code warning.

## Prerequisites

- Manifest parser, compatibility evaluator, and lifecycle host.
- Approved same-context module format and loader path policy.
- Native file/path adapter conventions in `apps/desktop/src/native/` and Rust commands under `apps/desktop/src-tauri/src/`.

## Exact likely file areas

- Add `apps/desktop/src/extensions/localDirectoryLoader.ts` and tests; keep orchestration separate from `desktopExtensionHost.ts`.
- Add platform-neutral loader interfaces only if needed in `packages/core/src/extensions/loader.ts`.
- Add native directory/module metadata commands in `apps/desktop/src/native/commands.ts` and `apps/desktop/src-tauri/src/commands/` only if the approved browser/Tauri import path requires them.
- Bootstrap consumer will live in `apps/desktop/src/extensions/bootstrap.ts`, a separate story.

## Implementation tasks

1. Define a loader interface for directory path, parsed manifest, module import, compatibility result, and disposable unload handle; document that code runs with app privileges.
2. Validate directory shape and manifest/entry path without following symlinks or path traversal beyond the approved policy; return typed diagnostics with source path.
3. Implement the approved module import strategy and map the exported extension definition to the host id. Reject wrong exports, duplicate ids, and failed activation with cleanup.
4. Implement explicit reload/unload behavior. If hot reload is approved, add a narrowly scoped watcher/debounce adapter and ensure old registrations/disposables are gone before replacement.
5. Add fixture integration tests using a sample local extension and a failing extension; avoid relying on a global developer machine path.

## Acceptance criteria

- [ ] A valid local directory loads only after manifest and compatibility validation.
- [ ] Entry module receives the scoped API and explicit app-privileges warning.
- [ ] Invalid paths/manifests/exports and activation failures fail loudly and leave no registrations behind.
- [ ] Unload/reload disposes lifecycle-owned resources before a new instance activates.
- [ ] Path and module strategy works in shared desktop/mobile webview constraints or documents a mobile limitation.

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

- `plans/extensions/pending-extension_manifest_format-low-med.md`
- `plans/extensions/pending-extension_capability_compatibility-low-med.md`
- `plans/extensions/pending-extension_execution_model-low-med.md`
- `plans/technical-decisions.md`
