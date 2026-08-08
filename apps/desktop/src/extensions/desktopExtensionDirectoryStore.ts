/**
 * Remembers development extension directories in the desktop-state document,
 * so directories added through the Extensions panel survive a restart.
 */

import {
  loadDesktopState,
  saveDesktopState,
  type DesktopStateGateway
} from "../settings/desktopState";
import type { ExtensionDirectoryStore } from "./localExtensions";

export function createDesktopExtensionDirectoryStore(
  gateway?: DesktopStateGateway
): ExtensionDirectoryStore {
  return {
    load: async () => (await loadDesktopState(gateway)).developmentExtensionDirectories,
    save: async (directories) => {
      await saveDesktopState({ developmentExtensionDirectories: directories }, gateway);
    }
  };
}
