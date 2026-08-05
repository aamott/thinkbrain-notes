/**
 * Public entry point for the modular settings system.
 *
 * Re-exports the type system, registry, defaults, validation, and built-in
 * modules. `SettingsDiagnostic` is intentionally NOT re-exported here to avoid
 * a duplicate-export collision with `../settings` (the legacy persistence
 * layer) when both are re-exported from `packages/core/src/index.ts`. Consumers
 * should import `SettingsDiagnostic` from the package root, which sources it
 * from `../settings`.
 */

export * from "./types";
export * from "./registry";
export * from "./defaults";
export * from "./validation";
export * from "./modules";
export * from "./dynamic";
