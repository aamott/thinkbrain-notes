# Extension Soft Capability Compatibility

## Status

✅ Shipped. `packages/core/src/extensions/compatibility.ts` evaluates API-version/platform compatibility and reports unavailable capabilities as soft warnings; bootstrap and local loading consume the result.

## Goal

Evaluate manifest-declared capabilities, API versions, and platform requirements as soft compatibility gates. Unsupported operations may be unavailable or produce warnings, especially on mobile, but the result must never be described as a security sandbox: beta extensions are trusted same-context code with app privileges.

## Shipped compatibility contract

- API compatibility accepts only `*`, exact `x.y.z`, `^x.y.z`, and `~x.y.z`. Other ranges are incompatible and produce an error; the evaluator does not guess at richer semver syntax.
- Platform mismatch and malformed host/API versions are errors and prevent registration/loading.
- Missing capabilities are warnings only: they mark the feature unavailable without blocking a trusted extension or granting an operation. Compatibility output never represents permissions, sandboxing, or isolation.
- Capability and compatibility reasons are surfaced in the extension status/Extensions panel; trusted same-context code still runs with app privileges.

## Prerequisites

- Shipped manifest parser and typed capability declarations from `done-extension_manifest_format-low-med.md`.
- Existing `AppPlatform` type in `packages/core/src/index.ts` and lifecycle host in `packages/core/src/lifecycle.ts`.
- Native availability facts from `apps/desktop/src/native/commands.ts` and Tauri mobile constraints in `plans/technical-decisions.md`.

## Exact likely file areas

- Add `packages/core/src/extensions/compatibility.ts` and tests; export from `packages/core/src/index.ts`.
- Add desktop platform adapter/result wiring under `apps/desktop/src/extensions/` and tests.
- Update manifest/runtime context types only; do not add security enforcement to `apps/desktop/src-tauri/src/lib.rs` in this story.

## Shipped implementation

1. `evaluateCompatibility(manifest, host)` parses the concrete host API version, evaluates the approved narrow semver grammar, checks declared platforms, and preserves every reason.
2. Capability mismatches produce warnings; API-version/platform mismatches produce errors and make the result incompatible.
3. The host supplies platform/capability facts through `CompatibilityHost`; no native secret, filesystem, process, network, or security enforcement is added here.
4. Tests cover compatible, unsupported capability, API mismatch, unsupported range, and platform mismatch cases.

## Acceptance criteria

- [x] Compatibility output is typed, stable, and distinguishes advisory warning from unavailable capability and incompatibility.
- [x] Desktop/mobile platform facts are supplied and tested.
- [x] Unsupported capabilities do not silently grant an operation and never imply hostile-code protection.
- [x] API-version mismatch and unsupported ranges produce explicit incompatibility diagnostics.
- [x] No native secret, filesystem, process, or network operation is implemented here.

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

- Capability/platform compatibility contract, narrow beta semver grammar, typed evaluator, fixtures/tests, and integration notes for loader/bootstrap stories.
- Approved warning/incompatibility copy and the trusted app-privileges boundary.

## References

- `plans/extensions/done-extension_manifest_format-low-med.md`
- `plans/technical-decisions.md` — trusted local same-context model
- `plans/app-vision.md` — mobile/shared webview architecture
