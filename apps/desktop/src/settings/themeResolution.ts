/**
 * Shared system-theme resolution.
 *
 * Resolves a theme value to a concrete `light` or `dark` base. `"system"` (and
 * any unexpected value) is resolved against the OS `prefers-color-scheme` media
 * query so the `data-thinkbrain-theme` attribute is always a concrete base —
 * never `"system"`. This keeps custom-theme-file override selectors (scoped
 * under `:root[data-thinkbrain-theme="<base>"]`) matching correctly, and gives
 * JS consumers a readable base.
 *
 * Returns `"light"` when `matchMedia` is unavailable (SSR / very old webview).
 *
 * Extracted here so both `ThemeProvider` (live resolution) and
 * `themeImportExport` (snapshot for export) share one implementation — the
 * matchMedia query and fallback strategy must not drift between call sites.
 */

import type { ThemeBase } from "@thinkbrain/core";

/**
 * Resolves a theme value to a concrete `light` or `dark` base.
 *
 * Args:
 *   theme: The theme setting to resolve (`"light"`, `"dark"`, `"system"`, or
 *     any unexpected string). Anything that is not `"light"` or `"dark"` is
 *     treated as `"system"` and resolved via the OS preference.
 *
 * Returns:
 *   `"light"` or `"dark"`. Falls back to `"light"` when `matchMedia` is
 *   unavailable (SSR / very old webview).
 */
export function resolveThemeBase(theme: string): ThemeBase {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  // "system" or any unexpected value: resolve via the OS preference.
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}
