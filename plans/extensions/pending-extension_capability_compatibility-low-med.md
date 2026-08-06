# Extension Soft Capability Compatibility

## Status

⬜ Not implemented. Capabilities are currently only a design decision; no manifest evaluator or platform result is wired into the host.

## Goal

Evaluate manifest-declared capabilities, API versions, and platform requirements as soft compatibility gates. Unsupported operations may be unavailable or produce warnings, especially on mobile, but the result must never be described as a security sandbox: beta extensions are trusted same-context code with app privileges.

## Discovery questions

- What is the authoritative beta capability vocabulary and which capabilities are advisory versus required for activation?
- Should an unsupported capability block activation, register an unavailable contribution, or allow activation with a warning?
- Which app semver range is supported now, and how are prerelease versions handled?
- Which platform values and feature matrix define desktop versus mobile (`terminal`, `process-spawn`, native secrets, file watching)?
- Where should warnings surface first: developer console/log, extension status, command/panel UI, or all three?

**Stop-and-ask gate:** Do not choose block/warn behavior, capability names, platform matrix, or user-facing warning copy until product/security owners answer these questions. Do not call a capability result “permission,” “sandbox,” or “isolation.”

## Prerequisites

- Manifest parser and typed capability declarations from `pending-extension_manifest_format-low-med.md`.
- Existing `AppPlatform` type in `packages/core/src/index.ts` and lifecycle host in `packages/core/src/lifecycle.ts`.
- Native availability facts from `apps/desktop/src/native/commands.ts` and Tauri mobile constraints in `plans/technical-decisions.md`.

## Exact likely file areas

- Add `packages/core/src/extensions/compatibility.ts` and tests; export from `packages/core/src/index.ts`.
- Add desktop platform adapter/result wiring under `apps/desktop/src/extensions/` and tests.
- Update manifest/runtime context types only; do not add security enforcement to `apps/desktop/src-tauri/src/lib.rs` in this story.

## Implementation tasks

1. Encode the approved capability vocabulary, API/app semver range, platform feature matrix, and typed result (`compatible`, warnings, unavailable capabilities, activation policy).
2. Implement a pure evaluator that is deterministic for the supplied app version/platform and preserves all diagnostics. Make unknown capabilities explicit rather than ignored.
3. Add desktop/mobile adapter inputs without importing platform code into core; ensure `terminal`/`process-spawn` are unavailable on mobile according to the approved matrix.
4. Integrate only the result object into the future extension context/status seam and add tests for compatible, unsupported, unknown, API mismatch, and platform mismatch cases.

## Acceptance criteria

- [ ] Compatibility output is typed, stable, and distinguishes advisory warning from unavailable operation and activation refusal.
- [ ] Desktop/mobile feature matrix is tested and documented.
- [ ] Unsupported capabilities do not silently grant an operation and never imply hostile-code protection.
- [ ] API-version mismatch produces an explicit deprecation/incompatibility diagnostic.
- [ ] No native secret, filesystem, process, or network operation is implemented here.

## Automated validation

- `pnpm --filter @thinkbrain/core test -- compatibility`
- `pnpm --filter @thinkbrain/core typecheck`
- Desktop extension tests for adapter/platform mapping; then `pnpm lint` and `pnpm typecheck`.

## Manual desktop/mobile checks

- Desktop: load a fixture requesting supported and unknown capabilities and verify status/warning text without claiming sandboxing.
- Mobile: run the shared app with a fixture requesting `terminal`/`process-spawn`; verify unavailable state and no attempted native call.

## Non-goals

No OS permission model, sandbox/process isolation, signing, network policy, secret storage, installer, or marketplace behavior.

## Handoff artifacts

- Capability vocabulary/matrix decision record.
- Pure evaluator, typed result contract, fixtures/tests, and integration notes for loader/API stories.
- Approved warning/block copy and list of unresolved platform capabilities.

## References

- `plans/extensions/pending-extension_manifest_format-low-med.md`
- `plans/technical-decisions.md` — trusted local same-context model
- `plans/app-vision.md` — mobile/shared webview architecture
