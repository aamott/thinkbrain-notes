# Settings Schema Safety

## Goal

Close the remaining schema-safety gaps in the modular settings core without changing
settings UI behavior: make `SettingDefinition.default` agree with its declared type,
reject malformed enum schemas (including an empty options list), and make validation
exhaustive when a new `SettingType` is added.

## Files

- `packages/core/src/settings/types.ts` — replace the unconstrained `default: unknown`
  shape with a discriminated/mapped definition type. Preserve the current intentional
  `path` sentinel (`string | null`) and make enum options required for enum definitions
  (a non-empty tuple at the type boundary where practical).
- `packages/core/src/settings/registry.ts` — validate runtime definitions from extension
  or manifest data during `resolveDefinition`/registration. Reject a default whose
  runtime type does not match its type, an enum without options, an empty enum options
  list, or an enum default not in its options. Keep existing duplicate and module-id
  checks unchanged.
- `packages/core/src/settings/validation.ts` — replace the unreachable `default:
  return undefined` in `checkType` with a `never` exhaustiveness guard. Keep the existing
  finite-number rejection and path-null behavior; do not regress them.
- `packages/core/src/settings/registry.test.ts` and a focused
  `packages/core/src/settings/validation.test.ts` — cover registration failures,
  exhaustive type validation, path-null defaults, valid enum defaults, and invalid
  enum schemas.

## Reproduction / verification

- Before the fix, a definition such as `{ type: "number", default: "16" }` can be
  constructed and registered, and `{ type: "enum", options: [], default: "x" }`
  reaches validation without a schema diagnostic.
- Add a temporary/new `SettingType` case in a type-check fixture (or equivalent
  compile-time assertion) and verify `checkType` fails to compile until its branch is
  implemented.
- Run the focused core settings tests, `pnpm typecheck`, and `pnpm lint`.

## Acceptance criteria

- [ ] TypeScript rejects defaults whose type is incompatible with the declared setting
      type; runtime registration also rejects untrusted/dynamic definitions.
- [ ] Enum definitions require at least one allowed option at registration and cannot
      declare a default outside that set.
- [ ] `checkType` is compile-time exhaustive; no unknown setting type silently passes.
- [ ] `path` defaults may remain `null` and validate consistently with the existing
      `path` control contract.
- [ ] Existing built-in modules and dynamic parse/serialize tests pass unchanged in
      behavior for valid definitions.

## Manual checks

- Load settings containing a malformed extension schema and confirm activation/registry
  setup reports a clear error before the schema is used.
- Open the normal Editor, Appearance, and path-setting controls and verify valid
  defaults still render and save normally.

## Automated tests

- Core registry tests for wrong default type, missing/empty enum options, invalid enum
  default, and valid path `null` default.
- Validation tests for every current type, `Infinity`/`-Infinity`, enum membership, and
  the exhaustiveness fixture.

## Non-goals

- Do not redesign settings persistence, migration ordering, or the settings UI.
- Do not add new setting types or change the user-facing font-size range.
- Do not fold extension manifest parsing or secret storage into this story.
