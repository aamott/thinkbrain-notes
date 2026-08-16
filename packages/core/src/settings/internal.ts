/**
 * Platform-agnostic shared helpers for the modular settings system.
 *
 * This is a leaf module: it must NOT import React, DOM APIs, Node.js built-ins,
 * or Tauri APIs (per `packages/core/AGENTS.md`). It exists to break import
 * cycles and eliminate duplication of small utility functions that were
 * previously copy-pasted across `settings.ts`, `settings/dynamic.ts`, and the
 * desktop settings modules.
 */

/**
 * Current schema version for app/workspace settings documents.
 *
 * Defined here (rather than `../settings.ts`) so that `./dynamic.ts` can import
 * it without creating a runtime cycle back through `../settings.ts`, which
 * re-exports from `./dynamic.ts`. `../settings.ts` re-exports this constant for
 * backward compatibility with consumers that import from `@thinkbrain/core`.
 */
export const CURRENT_SETTINGS_VERSION = 1;

/** Type guard for a plain JSON object record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Extracts a human-readable message from an unknown error. */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** De-duplicates a list of strings, preserving first-occurrence order. */
export { uniqueStrings } from "../lib/strings";

/** Compile-time exhaustiveness guard for `SettingType`. Throws on unknown types. */
export function assertNeverSettingType(def: never): never {
  throw new Error(
    `Unhandled setting type "${String((def as { type?: unknown }).type)}".`
  );
}

/**
 * Diagnostic shape returned by {@link readSettingsVersion}.
 *
 * Structurally compatible with `SettingsDiagnostic` (declared in `../settings`)
 * so callers can use the result without an explicit cast. Defined locally to
 * keep this leaf module free of imports from the settings persistence layer.
 */
export interface SettingsVersionDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
  readonly path?: string;
}

/**
 * Reads and validates the `version` field from a raw settings record.
 *
 * Defaults to version 0 (unversioned) when the field is absent. A malformed
 * version (non-integer, negative) yields a `settings.version.invalid` error
 * diagnostic and is treated as v0: nothing can be said about what the rest of
 * that document means.
 *
 * A version merely *newer* than `CURRENT_SETTINGS_VERSION` is different, and is
 * a warning. The document is intact and was written by a build that only added
 * to it, so every key this build knows is still readable; what it cannot do is
 * run migrations it does not have. Rejecting it outright is how running a newer
 * build and then an older one used to cost the user every setting they had.
 */
export function readSettingsVersion(
  value: Readonly<Record<string, unknown>>
): { readonly version: number; readonly diagnostic?: SettingsVersionDiagnostic } {
  const version = value.version;

  if (version === undefined) {
    return { version: 0 };
  }

  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    return {
      version: 0,
      diagnostic: {
        code: "settings.version.invalid",
        message: "Application settings version must be a non-negative integer; defaults were used.",
        severity: "error",
        path: "version"
      }
    };
  }

  if (version > CURRENT_SETTINGS_VERSION) {
    return {
      version,
      diagnostic: {
        code: "settings.version.unsupported",
        message: `Application settings version ${version} was written by a newer build than this one (version ${CURRENT_SETTINGS_VERSION}); anything it added is kept but not understood here.`,
        severity: "warning",
        path: "version"
      }
    };
  }

  return { version };
}
