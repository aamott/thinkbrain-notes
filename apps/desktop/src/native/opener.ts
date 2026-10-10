/**
 * Native opener bridge adapter for the platform file manager.
 *
 * UI components must never invoke Tauri IPC directly (per the app boundary
 * rules). This helper wraps `@tauri-apps/plugin-opener`'s `revealItemInDir`
 * so surfaces like the workspace manager can point at a folder in Finder /
 * Explorer without importing Tauri APIs themselves. Non-Tauri contexts
 * (tests, web preview) resolve quietly instead of crashing — the plugin has
 * no mobile implementation, so callers gate visibility themselves.
 */

import { isTauri } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

/**
 * Reveals a file or folder in the OS file manager (Finder, Explorer, etc.).
 *
 * Args:
 *   path: Absolute path of the item to reveal.
 *
 * Resolves without doing anything when the runtime is not Tauri.
 */
export async function revealPathInFileManager(path: string): Promise<void> {
  // Guard non-Tauri contexts (tests, web-only dev) so callers don't crash.
  if (!isTauri()) return;
  await revealItemInDir(path);
}
