/**
 * Shared system-theme resolution — resolves `"system"` (or any unexpected
 * value) to a concrete `light`/`dark` via `matchMedia`. Used by both
 * `ThemeProvider` (live resolution) and `themeImportExport` (export snapshot)
 * so the query and fallback strategy don't drift.
 */

import type { ThemeBase } from "@thinkbrain/core";

/** Resolves a theme value to `light` or `dark`. Falls back to `light` when
 *  `matchMedia` is unavailable (SSR / very old webview). */
export function resolveThemeBase(theme: string): ThemeBase {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}
