/**
 * Shared shell primitives extracted from DesktopShell.tsx.
 *
 * These types describe the activity bar panels and document view state used
 * throughout the desktop shell composition. Panel metadata lives in the desktop
 * contribution registry rather than in shell-specific action arrays.
 */

import { getDesktopPanelOrUndefined, type RightPanel } from "../panels/panelRegistryModel";

/**
 * Narrow shell selection types re-exported from the panel registry.
 *
 * `LeftPanel`/`RightPanel` are restricted to first-party side-specific ids or
 * an extension-prefixed id so a typo in shell state is a compile-time error.
 * The wide `DesktopPanelId` (which admits any string) remains in the registry
 * module for registration and lookup only.
 */
export type {
  BuiltInLeftPanel,
  BuiltInRightPanel,
  LeftPanel,
  RightPanel
} from "../panels/panelRegistryModel";

/**
 * Narrows `revealPanel`'s wide command-context string to real right-dock
 * shell state.
 *
 * `revealPanel` is exposed to extension command handlers as a plain `string`
 * (see `DesktopCommandContext`) so any extension can reveal a panel it
 * registered, without the shell enumerating every extension id up front.
 * Checking membership against the live registry — rather than trusting the
 * built-in/extension naming convention alone — means a typo or a stale id
 * from a deactivated extension is dropped instead of reaching narrow
 * `rightPanel` state that `getDesktopPanelOrUndefined` would then fail to
 * resolve at render time.
 */
export function isSelectableRightPanel(id: string): id is RightPanel {
  return getDesktopPanelOrUndefined(id)?.side === "right";
}

/**
 * Which side dock a width applies to.
 *
 * Here rather than in either of its two users, which each had their own copy:
 * the resize handles and the width persistence have to mean the same thing by
 * "left".
 */
export type PanelSide = "left" | "right";

/**
 * Bottom dock panel ids.
 *
 * Only the terminal surface is wired today; the union is kept open for future
 * extensibility (diagnostics, output logs, etc.) without re-widening the type.
 */
export type BottomPanel = "terminal";

/**
 * Declares the data-provider boundary for a bottom-panel surface.
 *
 * Panels remain visually present before their backing services are available,
 * while this contract prevents the UI from implying a capability exists.
 */
export interface BottomPanelProvider {
  readonly id: BottomPanel;
  readonly isAvailable: boolean;
  readonly unavailableMessage: string;
}

/** Lifecycle + contents of a single open Markdown document view. */
export type DocumentViewState = {
  readonly contents: string;
  /**
   * The text this view was last level with on disk, sent as the precondition on
   * the next save so a file something else has rewritten is refused rather than
   * overwritten. It moves on every load, re-read and successful save — not only
   * at open — since each of those is a moment the two are known to agree.
   *
   * `null` means the view never got that far: a load still running, or one that
   * failed. A save then has nothing truthful to expect, so it does not happen at
   * all — the alternative is writing an empty buffer over a file the shell was
   * never able to read.
   */
  readonly diskContents: string | null;
  readonly phase: "loading" | "ready" | "saving" | "error";
  readonly error: string | null;
};
