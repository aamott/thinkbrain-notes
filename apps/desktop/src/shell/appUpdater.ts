import { checkForAppUpdate } from "../native/commands";
import { isNativeHost } from "../native/runtime";
import type { AvailableUpdate } from "./useAppUpdate";

/**
 * The shell's view of the update check, kept away from {@link useAppUpdate} so
 * the hook and its tests never import a plugin that only exists inside the
 * app. The Tauri IPC itself lives in `native/commands.ts` (`checkForAppUpdate`,
 * `relaunchApp`) — all plugin calls route through `native/` per the app
 * boundary rule.
 *
 * `null` where there is no updater to talk to — a browser dev run, or a mobile
 * build, which is gated out natively as well.
 */
export const checkForUpdate: (() => Promise<AvailableUpdate | null>) | null = isNativeHost()
  ? checkForAppUpdate
  : null;

export { relaunchApp } from "../native/commands";
