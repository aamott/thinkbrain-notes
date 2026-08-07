# Extension Manifest Parser

## Status

✅ Shipped. The current parser API is `parseExtensionManifest(value)`: `packages/core/src/extensions/manifest.ts` parses `extension.json` into a typed manifest and accumulates actionable diagnostics; bootstrap and the local-directory loader consume the result.

## Goal

Define a strict, platform-neutral `extension.json` contract and parser for trusted local extensions. The parser produces typed manifest data for the loader, soft compatibility evaluator, static contribution registry, and lazy activation. It is validation and diagnostics, not a trust or sandbox boundary.

## Shipped contract and remaining gaps

- `apiVersion` accepts only the beta semver grammar `*`, exact `x.y.z`, `^x.y.z`, or `~x.y.z`; any other range is incompatible.
- Supported activation events are `onStartup`, `onCommand:<id>`, and `onView:<id>`. `onLanguage:<language>` remains unsupported and is retained with a warning so a newer manifest does not fail parsing.
- Unknown top-level fields are ignored for forward compatibility. Manifest-declared contributions are limited to commands and panels; tabs and editor headers register at runtime.
- The parser validates canonical extension/relative contribution ids, required fields, platforms, entry metadata, and collects diagnostics. Duplicate contribution/extension ids are still diagnosed by their host/registry rather than by the parser.

## Prerequisites

- Canonical id rule and lifecycle types in `packages/core/src/lifecycle.ts`.
- Contribution contracts in `packages/core/src/contributions.ts` and scoped settings bridge in `apps/desktop/src/extensions/desktopExtensionHost.ts`.
- `plans/app-vision.md` and `plans/technical-decisions.md`.

## Shipped file areas

- `packages/core/src/extensions/manifest.ts` and `manifest.test.ts` — parser/types/tests.
- `packages/core/src/index.ts` — exports.
- `apps/desktop/src/extensions/` — loader/bootstrap consumers; entry-path validation belongs to `packages/core/src/extensions/loader.ts`, not the manifest parser.

## Shipped implementation

1. `parseExtensionManifest(value)` validates manifest shape, canonical ids, required fields, platforms, activation events, capabilities, commands/panels, and the optional `main` field's type. Loader path resolution separately enforces relative `.js`/`.mjs` entry rules.
2. Parsing is deterministic and non-throwing: it collects all diagnostics, ignores unknown top-level fields, and returns `null` for manifests containing error diagnostics.
3. The parser accepts the beta API-version grammar documented above; richer semver expressions are rejected later by the compatibility evaluator as incompatible.
4. Tests cover valid/minimal manifests, malformed fields and ids, unknown activation events (including unsupported `onLanguage`), platforms, optional entry metadata, and forward-compatible unknown fields.

## Acceptance criteria

- [x] Approved schema documentation and parser tests agree.
- [x] Parser is deterministic, platform-agnostic, typed, and fails loudly with actionable diagnostics.
- [x] Canonical extension and relative contribution ids are enforced.
- [x] Parsed data is consumed by the loader/compatibility/bootstrap stories.
- [x] Parser does not load files or claim security isolation.
- [ ] Duplicate-id diagnostics are still a host/registry gap, not a parser guarantee.

## Automated validation

- `pnpm --filter @thinkbrain/core test -- manifest`
- `pnpm --filter @thinkbrain/core typecheck`
- Then `pnpm lint` and `pnpm typecheck`.

## Manual desktop/mobile checks

- Desktop: inspect/parse a sample manifest through a test harness; optional source/path diagnostics are a non-blocking follow-up, not a shipped parser requirement.
- Mobile: run the pure parser fixture tests in the shared frontend build; no native module load.

## Non-goals

No module loading, directory discovery, compatibility enforcement, installation, signing, URL/marketplace behavior, settings UI, or feature rendering.

## Handoff artifacts

- Manifest types/parser/tests, approved beta semver grammar, valid/invalid fixtures, consumer contract, and validation report.
- Non-blocking follow-ups: optional source/path diagnostics and duplicate-id diagnostics at the host/registry boundary.

## References

- `plans/pending-extensions-low-hard.md`
- `plans/technical-decisions.md` — Extensions
- `packages/core/src/lifecycle.ts`
- `packages/core/src/contributions.ts`
