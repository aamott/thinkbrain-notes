import type { CompatibilityReason, Disposable, ExtensionStatus } from "@thinkbrain/core";

/**
 * The app-wide bootstrap reference and its result types.
 *
 * This module deliberately has **no value imports**. `panelRegistry` renders
 * the Extensions panel, which needs the bootstrap, but the bootstrap needs the
 * panel registry to install stubs. Holding the reference here breaks that cycle;
 * importing `bootstrap.ts` from the panel instead crashes app startup with
 * "Cannot access 'desktopPanelRegistry' before initialization".
 */

export type BootstrapEntryStatus = ExtensionStatus | "incompatible";

export interface BootstrapEntry {
  readonly id: string;
  readonly name: string;
  readonly status: BootstrapEntryStatus;
  readonly reasons: readonly CompatibilityReason[];
}

export interface ExtensionBootstrap extends Disposable {
  /** Current status of every built-in, for the Extensions panel. */
  entries(): readonly BootstrapEntry[];
  /**
   * Subscribes to status changes and returns an unsubscribe function.
   *
   * Needed because a status flips during activation, which is triggered from
   * another panel entirely — without this the Extensions panel would keep
   * showing "Not started" for an extension that is already running.
   */
  subscribe(listener: () => void): () => void;
}

let activeBootstrap: ExtensionBootstrap | null = null;

/** Publishes the app-wide bootstrap. Only startup should call this. */
export function setExtensionBootstrap(bootstrap: ExtensionBootstrap | null): void {
  activeBootstrap = bootstrap;
}

/** Returns the app-wide bootstrap, or `null` before startup has run. */
export function getExtensionBootstrap(): ExtensionBootstrap | null {
  return activeBootstrap;
}
