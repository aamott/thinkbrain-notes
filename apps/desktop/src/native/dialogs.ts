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
import { open, save } from "@tauri-apps/plugin-dialog";

/**
 * Opens a native single-file picker and returns the selected path, or `null`
 * when the user cancels or the runtime is not Tauri.
 *
 * Args:
 *   title: Optional dialog title (defaults to "Select file"). When `extensions`
 *     is provided, the title (with any trailing punctuation stripped) is also
 *     used as the filter name shown in the dialog's file-type dropdown, so the
 *     filter label always reflects what the caller is asking the user to pick.
 *   extensions: Optional readonly list of file extensions (without the leading
 *     dot) used to filter the dialog. When provided, only files matching one of
 *     the extensions (plus directories) are selectable. When omitted, no filter
 *     is applied and all files are shown.
 *
 * Returns:
 *   The absolute path string, or `null` if cancelled / unavailable.
 */
export async function pickFilePath(
  title = "Select file",
  extensions?: readonly string[]
): Promise<string | null> {
  // Guard non-Tauri contexts (tests, web-only dev) so callers don't crash.
  if (!isTauri()) return null;

  const selection = await open({
    title,
    directory: false,
    multiple: false,
    // Tauri's `open` accepts a `filters` array of `{ name, extensions }`
    // objects. Spread the readonly input into a mutable array to satisfy the
    // dialog plugin's typed contract. The filter name is derived from `title`
    // (trailing punctuation trimmed) so it stays accurate for any caller
    // rather than being hardcoded to a specific file kind.
    filters: extensions
      ? [{ name: title.replace(/[\s\p{P}]+$/u, ""), extensions: [...extensions] }]
      : undefined
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

/**
 * Opens a native save-file dialog and returns the user-chosen path, or `null`
 * when the user cancels or the runtime is not Tauri.
 *
 * Args:
 *   title: Dialog window title.
 *   defaultName: Suggested file name (shown in the dialog's name field).
 *
 * Returns:
 *   The absolute path string the user confirmed, or `null` if cancelled /
 *   unavailable.
 */
export async function saveFilePath(
  title: string,
  defaultName: string
): Promise<string | null> {
  // Guard non-Tauri contexts (tests, web-only dev) so callers don't crash.
  if (!isTauri()) return null;

  const selection = await save({ title, defaultPath: defaultName });
  return typeof selection === "string" ? selection : null;
}
