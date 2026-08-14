/**
 * Platform-agnostic string helpers shared across core modules.
 *
 * Leaf module: must NOT import React, DOM APIs, Node.js built-ins, or Tauri
 * APIs (per `packages/core/AGENTS.md`). Kept separate from
 * `settings/internal.ts` so non-settings modules (markdown, frontmatter) do
 * not have to reach into the settings subsystem for generic utilities.
 */

/** De-duplicates a list of strings, preserving first-occurrence order. */
export function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
