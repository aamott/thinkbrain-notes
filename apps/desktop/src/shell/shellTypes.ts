/**
 * Shared shell primitives extracted from DesktopShell.tsx.
 *
 * These types describe the activity bar panels and document view state used
 * throughout the desktop shell composition. Panel metadata lives in the desktop
 * contribution registry rather than in shell-specific action arrays.
 */

/**
 * Narrow shell selection types re-exported from the panel registry.
 *
 * `LeftPanel`/`RightPanel` are restricted to first-party side-specific ids so
 * a typo in shell state is a compile-time error. The wide `DesktopPanelId`
 * (which also admits extension-owned string ids) remains in the registry module
 * for registration and lookup only.
 */
export type {
  BuiltInLeftPanel,
  BuiltInRightPanel,
  LeftPanel,
  RightPanel
} from "../panels/panelRegistry";

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
  readonly phase: "loading" | "ready" | "saving" | "error";
  readonly error: string | null;
};
