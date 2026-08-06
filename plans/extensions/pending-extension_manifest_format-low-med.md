# Extension Manifest Parser

## Status

⬜ Not implemented. The current lifecycle host accepts in-memory trusted definitions only; it does not read `extension.json`.

## Goal

Define a strict, platform-neutral `extension.json` contract and parser for trusted local extensions. The parser produces typed manifest data for the loader, soft compatibility evaluator, static contribution registry, and lazy activation. It is validation and diagnostics, not a trust or sandbox boundary.

## Discovery questions

- Should `apiVersion` accept a single semver, a range, or both, and which grammar is approved?
- Which exact capability names, activation-event payloads, and contribution schemas are beta-stable versus reserved?
- Are unknown top-level fields rejected, retained, or warned?
- Does the entry point allow one relative `.js` path only, or a broader module format?
- What `engines.app`/`engines.platform` shape should later consumers rely on?

**Stop-and-ask gate:** Do not finalize the schema, publish examples, or implement parser behavior until the product/API owner answers these questions and approves unknown-field and semver policy. Record the decision in the handoff.

## Prerequisites

- Canonical id rule and lifecycle types in `packages/core/src/lifecycle.ts`.
- Contribution contracts in `packages/core/src/contributions.ts` and scoped settings bridge in `apps/desktop/src/extensions/desktopExtensionHost.ts`.
- `plans/app-vision.md` and `plans/technical-decisions.md`.

## Exact likely file areas

- Add `packages/core/src/extensions/manifest.ts` and `manifest.test.ts`; export from `packages/core/src/index.ts`.
- Add fixtures under `packages/core/src/extensions/fixtures/` or a plan-owned fixture directory.
- Later consumers: `apps/desktop/src/extensions/`; do not implement them here.

## Implementation tasks

1. Write the approved JSON shape and typed unions for identity, semver/API compatibility, activation events, capabilities, engines, entry point, contributions, and settings schemas. Keep it DOM/Node/Tauri-free.
2. Implement pure `parseExtensionManifest(input: unknown, source?: string)` with canonical lowercase kebab-case ids, required-field checks, relative entry-path checks, duplicate contribution checks, and stable diagnostic codes/paths.
3. Apply the approved unknown-field policy; never silently coerce invalid values. Preserve source information in errors without reading files.
4. Add fixtures/tests for valid manifests, every required-field failure, malformed ids/paths, unknown fields, activation events, capabilities, apiVersion, contributions, and duplicate ids. Export types and typecheck core.

## Acceptance criteria

- [ ] Approved schema documentation and fixtures agree.
- [ ] Parser is deterministic, platform-agnostic, typed, and fails loudly with actionable diagnostics.
- [ ] Canonical extension and relative contribution ids are enforced.
- [ ] Parsed data is directly consumable by loader/compatibility stories.
- [ ] Parser does not load files or claim security isolation.

## Automated validation

- `pnpm --filter @thinkbrain/core test -- manifest`
- `pnpm --filter @thinkbrain/core typecheck`
- Then `pnpm lint` and `pnpm typecheck`.

## Manual desktop/mobile checks

- Desktop: inspect/parse a sample manifest through a test harness and verify source/path diagnostics.
- Mobile: run the pure parser fixture tests in the shared frontend build; no native module load.

## Non-goals

No module loading, directory discovery, compatibility enforcement, installation, signing, URL/marketplace behavior, settings UI, or feature rendering.

## Handoff artifacts

- Manifest types/parser/tests, schema decision note, valid/invalid fixtures, consumer contract, validation report, and unresolved semver/capability cases.

## References

- `plans/pending-extensions-low-hard.md`
- `plans/technical-decisions.md` — Extensions
- `packages/core/src/lifecycle.ts`
- `packages/core/src/contributions.ts`
