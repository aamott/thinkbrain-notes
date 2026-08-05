/**
 * Native dialog bridge adapters for Tauri file/folder pickers.
 *
 * UI components must never invoke Tauri IPC directly (per the app boundary
 * rules). These helpers wrap the `@tauri-apps/plugin-dialog` `open` call so
 * controls like `PathControl` can trigger a native file browser without
 * importing Tauri APIs themselves. Non-Tauri contexts (tests, web preview)
 * are guarded so the helpers resolve to `null` instead of crashing.
 */

import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/**
 * Opens a native single-file picker and returns the selected path, or `null`
 * when the user cancels or the runtime is not Tauri.
 *
 * Args:
 *   title: Optional dialog title (defaults to "Select file").
 *
 * Returns:
 *   The absolute path string, or `null` if cancelled / unavailable.
 */
export async function pickFilePath(title = "Select file"): Promise<string | null> {
  // Guard non-Tauri contexts (tests, web-only dev) so callers don't crash.
  if (!isTauri()) return null;

  const selection = await open({
    title,
    directory: false,
    multiple: false
  });

  // `open` returns `string | null` when multiple is false.
  return typeof selection === "string" ? selection : null;
}
