import type { ExtensionManifest } from "@thinkbrain/core";

import type { DesktopExtensionActivation } from "../desktopExtensionHost";
import { activateNoteStats, noteStatsManifest } from "./noteStats";

/**
 * A built-in extension: a manifest paired with a statically imported activate
 * function.
 *
 * Built-ins ship as app code, so there is no `main` entry path to resolve.
 * Loading an extension's module from disk arrives with the local-directory
 * loader story; this shape is what that loader will produce.
 */
export interface BuiltInExtension {
  readonly manifest: ExtensionManifest;
  readonly activate: DesktopExtensionActivation;
}

export const builtInExtensions: readonly BuiltInExtension[] = [
  { manifest: noteStatsManifest, activate: activateNoteStats }
];
