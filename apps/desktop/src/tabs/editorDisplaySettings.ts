/**
 * Editor display preferences → CodeMirror extensions.
 *
 * `editor.fontSize` (absolute CSS px, 10–32) and `editor.lineWrapping`
 * (boolean) are ordinary app-scope settings. Both editors render through a
 * shared `Compartment` owned by `useCodeMirrorView`, so a preference change
 * reconfigures the live view instead of remounting it.
 */
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

export const EDITOR_FONT_SIZE_KEY = "editor.fontSize";
export const EDITOR_LINE_WRAPPING_KEY = "editor.lineWrapping";

export const EDITOR_FONT_SIZE_MIN = 10;
export const EDITOR_FONT_SIZE_MAX = 32;
export const EDITOR_FONT_SIZE_DEFAULT = 16;

/**
 * Resolves a stored/staged `editor.fontSize` to a usable integer px value.
 * Non-numeric or out-of-range values fall back toward the 10–32 band so an
 * imported or hand-edited config can never wedge the editor at 0px or a
 * runaway size.
 */
export function resolveEditorFontSize(value: unknown): number {
  // Numeric-only: the settings contract stores a number, and a coerced
  // non-number ("" → 0) must never shrink the editor toward the floor.
  const parsed = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(parsed)) return EDITOR_FONT_SIZE_DEFAULT;
  return Math.min(
    EDITOR_FONT_SIZE_MAX,
    Math.max(EDITOR_FONT_SIZE_MIN, Math.round(parsed))
  );
}

/**
 * Resolves `editor.lineWrapping`; anything but an explicit `false` wraps,
 * matching the registry default of `true`.
 */
export function resolveEditorLineWrapping(value: unknown): boolean {
  return value !== false;
}

/**
 * The extension a display compartment carries: the `&` theme rule pins the
 * editor's own font size in absolute px — independent of the interface
 * scale's root font size — plus line wrapping when enabled.
 */
export function displaySettingsExtension(
  fontSize: number,
  lineWrapping: boolean
): Extension {
  return [
    EditorView.theme({ "&": { fontSize: `${fontSize}px` } }),
    ...(lineWrapping ? [EditorView.lineWrapping] : [])
  ];
}
