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
 * Returns:
 *   The absolute path string, or `null` if cancelled / unavailable.
 */
export async function pickFilePath(): Promise<string | null> {
  // Guard non-Tauri contexts (tests, web-only dev) so callers don't crash.
  if (!isTauri()) return null;

  const selection = await open({
    title: "Select file",
    directory: false,
    multiple: false
  });

  // `open` returns `string | null` when multiple is false.
  return typeof selection === "string" ? selection : null;
}

/**
 * Opens a native directory picker and returns the selected path, or `null`
 * when the user cancels or the runtime is not Tauri.
 *
 * Args:
 *   title: Dialog title shown to the user.
 *
 * Returns:
 *   The absolute directory path, or `null` if cancelled / unavailable.
 */
export async function pickDirectoryPath(title: string): Promise<string | null> {
  // Guard non-Tauri contexts (tests, web-only dev) so callers don't crash.
  if (!isTauri()) return null;

  const selection = await open({ title, directory: true, multiple: false });
  return typeof selection === "string" ? selection : null;
}
