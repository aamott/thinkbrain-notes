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
