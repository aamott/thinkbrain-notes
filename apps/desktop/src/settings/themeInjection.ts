/**
 * Custom theme override injection (Story 2 of importable themes).
 *
 * Manages the `<style id="tn-custom-theme">` element in `<head>` that layers
 * parsed `.tbtheme.json` token overrides on top of the base palette. The
 * overrides are scoped under `:root[data-thinkbrain-theme="<base>"]` so they
 * only apply when the matching base palette is active — this keeps the base
 * theme's CSS as the lowest layer and the user's custom theme as a higher
 * layer that overrides individual `--tn-*` color tokens.
 *
 * This module is DOM-only and side-effectful; parsing/validation lives in
 * `@thinkbrain/core`'s `parseThemeFile`. SSR/test safety is provided by a
 * `typeof document === "undefined"` guard, though this is a desktop app and
 * the guard is purely defensive.
 */

import type { ThemeFile } from "@thinkbrain/core";

/** The `<style>` element id used to layer custom theme overrides. */
const STYLE_ELEMENT_ID = "tn-custom-theme";

/**
 * Builds the CSS text for a parsed theme file.
 *
 * Each token entry becomes a CSS variable declaration (`key: value;`), and the
 * whole rule is scoped under `:root[data-thinkbrain-theme="<base>"]` so the
 * overrides only apply when the matching base palette is active. Values are
 * inserted as-is — they are CSS color strings produced by `parseThemeFile`,
 * which already validated them as non-empty strings.
 *
 * Args:
 *   theme: The parsed theme document.
 *
 * Returns:
 *   A single CSS rule string.
 */
function buildThemeCss(theme: ThemeFile): string {
  const declarations: string[] = [];
  for (const [token, value] of Object.entries(theme.tokens)) {
    // Values are validated non-empty strings from parseThemeFile; insert as-is.
    declarations.push(`  ${token}: ${value};`);
  }
  // Empty token maps are valid (a theme that only fixes the base palette);
  // emit an empty rule body so the <style> still has a clear marker.
  const body = declarations.length > 0
    ? `\n${declarations.join("\n")}\n`
    : "";
  return `:root[data-thinkbrain-theme="${theme.base}"] {${body}}`;
}

/**
 * Injects (or replaces) the custom theme override `<style>` element.
 *
 * Finds the existing `<style id="tn-custom-theme">` element in `document.head`
 * or creates one if none exists, then sets its `textContent` to a CSS rule
 * scoping the theme's token overrides under
 * `:root[data-thinkbrain-theme="<base>"]`. Repeated calls replace the content
 * rather than appending a second element, so the active custom theme can be
 * swapped without leaking `<style>` nodes.
 *
 * Args:
 *   theme: The parsed theme document whose tokens should be injected.
 */
export function injectThemeOverrides(theme: ThemeFile): void {
  // Defensive guard for SSR/test contexts without a DOM. This is a desktop
  // app so `document` is normally always defined, but the guard keeps unit
  // tests that run in a bare Node env from crashing.
  if (typeof document === "undefined") return;

  let style = document.getElementById(
    STYLE_ELEMENT_ID
  ) as HTMLStyleElement | null;
  if (style === null) {
    style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    document.head.append(style);
  }
  style.textContent = buildThemeCss(theme);
}

/**
 * Removes the custom theme override `<style>` element if it exists.
 *
 * Safe to call when no override element is present (no-op). Called when the
 * user clears the `appearance.themeFile` setting or when a theme file fails
 * to parse, so the UI reverts to the base palette.
 */
export function removeThemeOverrides(): void {
  if (typeof document === "undefined") return;
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}
