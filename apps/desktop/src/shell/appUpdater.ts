import { isTauri } from "@tauri-apps/api/core";

import type { AvailableUpdate } from "./useAppUpdate";

/**
 * The Tauri half of the update check, kept away from {@link useAppUpdate} so the
 * hook and its tests never import a plugin that only exists inside the app.
 *
 * `null` where there is no updater to talk to — a browser dev run, or a mobile
 * build, which is gated out natively as well. The plugins are loaded on demand
 * so a build without them does not pay for them at startup.
 */
export const checkForUpdate: (() => Promise<AvailableUpdate | null>) | null = isTauri()
  ? async () => {
      const { check } = await import("@tauri-apps/plugin-updater");
      return await check();
    }
  : null;

export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
