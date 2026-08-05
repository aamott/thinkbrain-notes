/**
 * Native filesystem bridge adapters for Tauri file read/write operations.
 *
 * UI components must never invoke Tauri IPC directly (per the app boundary
 * rules). These helpers wrap the `@tauri-apps/plugin-fs` `writeTextFile` and
 * `readTextFile` calls so settings import/export can read and write files
 * without importing Tauri APIs themselves. Non-Tauri contexts (tests, web
 * preview) are guarded so the helpers resolve to `null` / empty instead of
 * crashing.
 */

import { isTauri } from "@tauri-apps/api/core";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";

/**
 * Writes text contents to an absolute path via the Tauri FS plugin.
 *
 * Args:
 *   path: Absolute file path to write.
 *   contents: String contents to write.
 *
 * Returns:
 *   `true` if the file was written, `false` if the runtime is not Tauri.
 */
export async function writeTextFileNative(
  path: string,
  contents: string
): Promise<boolean> {
  // Guard non-Tauri contexts (tests, web-only dev) so callers don't crash.
  if (!isTauri()) return false;

  await writeTextFile(path, contents);
  return true;
}

/**
 * Reads text contents from an absolute path via the Tauri FS plugin.
 *
 * Args:
 *   path: Absolute file path to read.
 *
 * Returns:
 *   The file contents as a string, or `null` if the runtime is not Tauri or
 *   the file cannot be read.
 */
export async function readTextFileNative(path: string): Promise<string | null> {
  // Guard non-Tauri contexts (tests, web-only dev) so callers don't crash.
  if (!isTauri()) return null;

  try {
    return await readTextFile(path);
  } catch {
    // File missing or unreadable — return null so callers can handle gracefully.
    return null;
  }
}
