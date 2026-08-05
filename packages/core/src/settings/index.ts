/**
 * Public entry point for the modular settings system.
 *
 * Re-exports the type system, registry, defaults, validation, and built-in
 * modules. `SettingsDiagnostic` is NOT re-exported from this barrel at all —
 * it is declared by the legacy persistence layer (`../settings`) and surfaced
 * to consumers only via `packages/core/src/index.ts` line 68
 * (`export * from "./settings"`). Keeping it out of this barrel avoids a
 * duplicate-export collision with `../settings` under TS `export *` semantics
 * when both `./settings` and `./settings/index` are re-exported from the
 * package root. Consumers should import `SettingsDiagnostic` from the package
 * root, which sources it from `../settings`.
 */

export * from "./types";
export * from "./registry";
export * from "./defaults";
export * from "./validation";
export * from "./modules";
export * from "./dynamic";
// Re-export only the shared helpers from ./internal — NOT `CURRENT_SETTINGS_VERSION`,
// which is already exported via `../settings` and would collide under `export *`
// semantics at the package root (same pattern as `SettingsDiagnostic` above).
export { isRecord, getErrorMessage } from "./internal";
