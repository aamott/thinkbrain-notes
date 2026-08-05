/**
 * Frontend adapter for the native `list_themes` command.
 *
 * Bridges the Tauri IPC boundary (per the desktop layer rule: UI components
 * never call Tauri directly — all native access goes through `native/`). The
 * adapter returns a typed `ThemeEntry[]` to the settings UI, and gracefully
 * degrades to an empty list in non-Tauri contexts (tests, web preview) so the
 * theme picker renders without errors outside the desktop shell.
 */

import { isTauri } from "@tauri-apps/api/core";
import { invokeNativeCommand } from "../native/commands";

/**
 * One discovered theme file returned by {@link listThemes}.
 *
 * Mirrors `NativeThemeEntry` from the native bridge, but re-exported under a
 * UI-friendly name so settings components do not depend on the `native/` layer
 * directly.
 */
export interface ThemeEntry {
  /** Display name parsed from the JSON `name` field (or filename stem fallback). */
  readonly name: string;
  /** Absolute filesystem path to the `.tbtheme.json` file. */
  readonly path: string;
}

/**
 * Lists every `.tbtheme.json` file discovered in the app-data themes directory.
 *
 * Delegates to the native `list_themes` command, which (on first run) seeds the
 * directory with the bundled preset themes before listing. Outside Tauri (tests
 * and web preview), returns an empty array so the picker UI can render without
 * a native bridge — the "None (use base theme)" option remains selectable.
 *
 * Returns:
 *   A readonly array of {@link ThemeEntry} entries (sorted by name on the
 *   native side). Empty in non-Tauri contexts.
 */
export async function listThemes(): Promise<readonly ThemeEntry[]> {
  // Non-Tauri contexts (vitest, web preview) have no native bridge. Return an
  // empty list so the picker renders with just the "None" option rather than
  // throwing an unhandled rejection.
  if (!isTauri()) {
    return [];
  }

  // The native command already returns `readonly NativeThemeEntry[]`, which is
  // structurally identical to `readonly ThemeEntry[]`. The cast is safe and
  // avoids a per-entry copy; the two interfaces share the exact same shape.
  return invokeNativeCommand("list_themes");
}
