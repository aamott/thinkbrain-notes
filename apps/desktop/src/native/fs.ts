/**
 * Native filesystem bridge for text files at user-picked paths.
 *
 * UI components must never invoke Tauri IPC directly (per the app boundary
 * rules). These helpers wrap the `pick_and_read_text_file` and
 * `save_and_write_text_file` commands, which run the system open/save dialog
 * on the Rust side and keep hold of the path it produces — the renderer never
 * supplies a path, so there is no filesystem capability to misuse. That is
 * what replaced the old `@tauri-apps/plugin-fs` wrappers: they needed the
 * unscoped `fs:allow-*` grants, which let any renderer code (including
 * same-realm extensions) reach arbitrary text files.
 *
 * Non-Tauri contexts (tests, web preview) resolve to `null` / `false`
 * instead of crashing. A falsy return means the user dismissed the dialog;
 * real failures arrive as `NativeCommandError` rejections.
 */

import { isTauri } from "@tauri-apps/api/core";
import { invokeNativeCommand, type NativePickedTextFile } from "./commands";

/**
 * Shows a native save dialog and writes `contents` to the chosen path.
 *
 * Args:
 *   title: Dialog window title.
 *   defaultName: Suggested file name shown in the dialog's name field.
 *   contents: Text to write.
 *
 * Returns:
 *   `true` if the file was written, `false` if the user dismissed the dialog
 *   or the runtime is not Tauri. Write failures reject — they reach the
 *   caller as `NativeCommandError`.
 */
export async function saveAndWriteTextFile(
  title: string,
  defaultName: string,
  contents: string
): Promise<boolean> {
  // Guard non-Tauri contexts (tests, web-only dev) so callers don't crash.
  if (!isTauri()) return false;

  return await invokeNativeCommand("save_and_write_text_file", {
    title,
    defaultName,
    contents
  });
}

/**
 * Shows a native open dialog and returns the chosen file with its contents.
 *
 * Args:
 *   title: Dialog title (also used as the file-type filter label).
 *   extensions: Optional list of extensions (no leading dot) to filter by.
 *
 * Returns:
 *   The picked file's path and contents, or `null` if the user dismissed the
 *   dialog or the runtime is not Tauri. Read failures reject — they reach the
 *   caller as `NativeCommandError`.
 */
export async function pickAndReadTextFile(
  title: string,
  extensions?: readonly string[]
): Promise<NativePickedTextFile | null> {
  // Guard non-Tauri contexts (tests, web-only dev) so callers don't crash.
  if (!isTauri()) return null;

  return await invokeNativeCommand("pick_and_read_text_file", {
    title,
    extensions: extensions ? [...extensions] : null
  });
}
