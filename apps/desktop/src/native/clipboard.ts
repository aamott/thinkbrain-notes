/**
 * Clipboard bridge adapters.
 *
 * Text copies use the Web Clipboard API directly (`navigator.clipboard`),
 * which is a renderer DOM API rather than IPC — callers like the StatusBar
 * already use it raw. This module exists for what the web API cannot do:
 * placing *files* on the system clipboard so a file manager can paste them,
 * which the native `copy_files_to_clipboard` command implements via OS
 * clipboard formats (`CF_HDROP`, `NSFilenamesPboardType`, `text/uri-list`).
 *
 * The command is desktop-only; callers should gate the UI on
 * `usePlatformCapabilities` (`canCopyFilesToClipboard`) rather than discover
 * the failure here. This guard remains as a fail-safe for non-Tauri contexts
 * (tests, web preview).
 */

import { isTauri } from "@tauri-apps/api/core";

import { invokeNativeCommand } from "./commands";

/**
 * Copies files to the system clipboard as file references.
 *
 * Args:
 *   paths: Absolute paths to copy. Pasting in a file manager duplicates them.
 *
 * Returns:
 *   `true` when the clipboard accepted the list, `false` when the runtime is
 *   not Tauri or the command failed (logged loudly).
 */
export async function copyFilesToClipboard(
  paths: readonly string[]
): Promise<boolean> {
  if (!isTauri() || paths.length === 0) return false;
  try {
    await invokeNativeCommand("copy_files_to_clipboard", { paths });
    return true;
  } catch (error) {
    console.error("[native/clipboard] Failed to copy files:", error);
    return false;
  }
}
