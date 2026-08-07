# Extension Lifecycle and Desktop Bootstrap

## Status

✅ Supported beta runtime boundary shipped for startup/command/view activation and host-owned registration cleanup. `onLanguage`, duplicate-id diagnostics, successful local Blob URL cleanup, and forwarding local module `deactivate` remain unchecked follow-ups below.

## Goal

Connect the existing disposable lifecycle to manifest-loaded extensions and a desktop bootstrap that starts/shuts down the extension host predictably. Support startup and lazy command/view activation without loading every extension at startup. Preserve cleanup on deactivate, unload, failed activation, and host shutdown.

## Shipped lifecycle contract and remaining gaps

- Bootstrap parses every built-in manifest, evaluates compatibility, registers compatible extensions, and exposes status/reasons through the Extensions panel.
- `onStartup` activates eagerly; `onCommand:<id>` and `onView:<id>` activate through disposable stubs. `onLanguage:<language>` is retained as a manifest warning but has no trigger point yet.
- Activation is at-most-once, failed activation removes stubs and records `failed`, and host removal/shutdown disposes extension-owned registrations before replacement or exit.
- Local extensions use the same host path and are rejected on duplicate extension ids, but duplicate-id diagnostics are still not a parser/loader result.
- Successful local unload still needs the loader module's `deactivate`/Blob-revocation handle forwarded through bootstrap disposal; no bootstrap claim should imply it is complete.

## Prerequisites

- Existing lifecycle/disposable implementation and tests in `packages/core/src/lifecycle.ts` and `apps/desktop/src/extensions/desktopExtensionHost.ts`.
- Manifest parser, compatibility evaluator, and local-directory loader.
- Existing React/Tauri startup in `apps/desktop/src/main.tsx`, `App.tsx`, `DesktopShell.tsx`, and native readiness conventions.

## Shipped file areas

- `apps/desktop/src/extensions/bootstrap.ts` and tests — runtime/bootstrap orchestration.
- `packages/core/src/lifecycle.ts` — generic disposable lifecycle contracts.
- `apps/desktop/src/main.tsx` / `App.tsx` — startup and shutdown integration.
- No separate `extensionRuntime.ts` exists; do not create one unless a proven split is needed.

## Shipped implementation

1. Bootstrap keeps manifest, source, compatibility/status, stubs, activation, and host-registration state per extension.
2. It registers manifest command/panel stubs before activation, swaps them for real scoped registrations on first command/view use, and eagerly activates `onStartup` entries.
3. It supports built-in and local-directory sources through one host, with status subscriptions and awaited disposal on removal/reload/shutdown.
4. Tests cover lazy/eager activation, concurrent activation, incompatible/invalid manifests, activation failure cleanup, local registration replacement, duplicate registration rejection, and shutdown disposal.
5. Status reasons preserve compatibility and load diagnostics, including the trusted app-privileges boundary; unsupported `onLanguage`, duplicate-id diagnostics, and Blob URL cleanup remain explicit gaps.

## Acceptance criteria

- [x] Existing lifecycle behavior remains passing and is consumed by manifest/runtime records.
- [x] Supported declared activation events trigger only the owning extension; unrelated extensions stay unloaded.
- [x] Bootstrap and shutdown are idempotent and dispose host registrations/resources.
- [x] Failed activation leaves no contributions and exposes status/diagnostics.
- [x] No feature epic behavior is moved into bootstrap.
- [ ] `onLanguage`, duplicate-id diagnostics, and forwarding local `deactivate`/Blob-revocation cleanup remain open.

## Automated validation

- Core lifecycle tests and desktop runtime/bootstrap tests.
- `pnpm --filter @thinkbrain/core test -- lifecycle` and `pnpm --filter @thinkbrain/desktop test -- extension`.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`; add Rust tests only if bootstrap adds a native command.

## Manual desktop/mobile checks

- Desktop Tauri: start app, verify built-in/bootstrap status, trigger a lazy command/view, close app, and verify cleanup/no duplicate registrations on reload.
- Mobile Tauri: launch without desktop-only extensions, verify shared bootstrap does not call unavailable capabilities and that shutdown does not hang.

## Non-goals

No new API contributions, manifest parsing, installer, marketplace, sandbox, or feature-specific Git/AI/journal behavior.

## Handoff artifacts

- Runtime/bootstrap modules, activation event matrix, startup/shutdown decision record, failure/retry policy, and integration test report.
- List of hooks consumed by API, local loader, and beta built-in stories.

## References

- `packages/core/src/lifecycle.ts`
- `apps/desktop/src/extensions/desktopExtensionHost.ts`
- `apps/desktop/src/extensions/localDirectoryLoader.ts`
- `apps/desktop/src/main.tsx`
- `apps/desktop/src/App.tsx`
- `plans/extensions/pending-beta_builtin_extensions-med-med.md`
