import type { ExtensionManifest } from "@thinkbrain/core";

import type { DesktopExtensionActivation } from "../desktopExtensionHost";
import { activateJournal, journalManifest, journalMobileNewNoteActions } from "./journal";
import { noteStatsManifest } from "./noteStats";
import { activateNoteStats } from "./noteStats.tsx";

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
  /**
   * Mobile New-note popup rows this extension contributes. They point at the
   * extension's canonical commands by id — the action owns no handler, so the
   * popup never bypasses lazy activation or command semantics.
   */
  readonly mobileNewNoteActions?: readonly {
    readonly id: string;
    readonly commandId: string;
    readonly label: string;
    readonly icon: string;
    readonly requiresWorkspace?: boolean;
  }[];
}

export const builtInExtensions: readonly BuiltInExtension[] = [
  { manifest: noteStatsManifest, activate: activateNoteStats },
  {
    manifest: journalManifest,
    activate: activateJournal,
    mobileNewNoteActions: journalMobileNewNoteActions
  }
];
