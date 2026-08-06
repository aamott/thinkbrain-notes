# Extension Lifecycle and Desktop Bootstrap

## Status

🟨 Partially implemented. `packages/core/src/lifecycle.ts` and `apps/desktop/src/extensions/desktopExtensionHost.ts` implement trusted in-memory activation/deactivation and disposable cleanup with tests. Manifest-driven lazy activation and application bootstrap are not implemented.

## Goal

Connect the existing disposable lifecycle to manifest-loaded extensions and a desktop bootstrap that starts/shuts down the extension host predictably. Support lazy activation events (`onStartup`, `onCommand`, `onView`, `onLanguage`) without loading every extension at startup. Preserve cleanup on deactivate, unload, failed activation, and host shutdown.

## Discovery questions

- Which bootstrap phase owns built-ins: before React render, after shell mount, or an explicit app-ready event?
- Is `onStartup` eager at app-ready or deferred until the first workspace is ready?
- How are command/view/language events emitted and queued if an extension is still loading?
- Should activation failure disable the extension for the current session, retry, or remain registered but failed?
- What shutdown deadline applies to async deactivation/background tasks?

**Stop-and-ask gate:** Do not wire app bootstrap, activation timing, retry policy, or shutdown timeouts until product/runtime owners answer these questions. Do not mark lifecycle complete merely because the existing host tests pass.

## Prerequisites

- Existing lifecycle/disposable implementation and tests in `packages/core/src/lifecycle.ts` and `apps/desktop/src/extensions/desktopExtensionHost.ts`.
- Manifest parser, compatibility evaluator, and local-directory loader.
- Existing React/Tauri startup in `apps/desktop/src/main.tsx`, `App.tsx`, `DesktopShell.tsx`, and native readiness conventions.

## Exact likely file areas

- Add `apps/desktop/src/extensions/extensionRuntime.ts`, `bootstrap.ts`, and tests.
- Extend `packages/core/src/lifecycle.ts` only for generic activation-event/status contracts; keep platform orchestration in desktop.
- Integrate startup/shutdown from `apps/desktop/src/App.tsx` or a root provider chosen after discovery; do not put Tauri calls in core.

## Implementation tasks

1. Define runtime records for parsed manifest, loader handle, compatibility result, activation events, status, and disposable ownership; cover concurrent activate/deactivate requests.
2. Implement event-to-extension activation routing and lazy activation with deterministic ordering, queued trigger behavior, and explicit failure status.
3. Implement desktop bootstrap/teardown around the existing app lifecycle, registering built-ins and development extensions through one host; make shutdown await cleanup and surface errors.
4. Add tests for startup ordering, onCommand/onView/onLanguage triggers, failed activation cleanup, deactivation/unload, duplicate ids, and host disposal.
5. Add status/log hooks for the app-privileges warning and compatibility diagnostics without claiming security isolation.

## Acceptance criteria

- [ ] Existing lifecycle behavior remains passing and is consumed by manifest/runtime records.
- [ ] Declared activation events trigger only the owning extension; unrelated extensions stay unloaded.
- [ ] Bootstrap and shutdown are idempotent and dispose all registrations/resources.
- [ ] Failed activation leaves no contributions and exposes typed status/diagnostics.
- [ ] No feature epic behavior is moved into bootstrap.

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
- `apps/desktop/src/main.tsx`
- `apps/desktop/src/App.tsx`
- `plans/extensions/pending-beta_builtin_extensions-med-med.md`
