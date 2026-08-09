import type {
  Disposable,
  ExtensionStatus,
  ManifestDiagnostic
} from "@thinkbrain/core";

import type { LoadedExtension } from "./localDirectoryLoader";

/**
 * A `BootstrapEntry` reason, carrying either a compatibility check's closed
 * code or a manifest/load diagnostic's open one.
 *
 * `CompatibilityReason.code` is a closed union because `evaluateCompatibility`
 * only ever produces those three; a manifest or load diagnostic's `code` is an
 * open string (`manifest_invalid_id`, `entry_absolute_path`, ...). Widening to
 * `string` here — rather than aliasing every diagnostic to `"capability"` —
 * keeps the distinguishing code intact for the Extensions panel.
 */
export interface BootstrapReason {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

/**
 * The app-wide bootstrap reference and its result types.
 *
 * This module deliberately has **no value imports** (type-only imports are
 * erased at build time and cannot close a runtime cycle). `panelRegistry` renders
 * the Extensions panel, which needs the bootstrap, but the bootstrap needs the
 * panel registry to install stubs. Holding the reference here breaks that cycle;
 * importing `bootstrap.ts` from the panel instead crashes app startup with
 * "Cannot access 'desktopPanelRegistry' before initialization".
 */

export type BootstrapEntryStatus = ExtensionStatus | "incompatible";

/** Where an extension came from. Built-ins ship as app code. */
export type ExtensionSource = "built-in" | "local-directory";

export interface BootstrapEntry {
  readonly id: string;
  readonly name: string;
  readonly status: BootstrapEntryStatus;
  readonly reasons: readonly BootstrapReason[];
  readonly source: ExtensionSource;
  /** Absolute directory a local extension was loaded from. */
  readonly directory?: string;
}

export interface ExtensionBootstrap extends Disposable {
  /** Current status of every extension, for the Extensions panel. */
  entries(): readonly BootstrapEntry[];
  /**
   * Activates every compatible extension, ignoring failures.
   *
   * Contributions that are *declared* — commands, panels — get stubs at
   * bootstrap, so laziness is invisible. Settings schemas are registered by the
   * extension's own `activate`, so until something wakes it there is simply no
   * section for it on the Settings page. Anything that claims to show
   * everything configurable has to call this first.
   */
  activateAll(): Promise<void>;
  /**
   * Registers an already-loaded local extension and stubs its commands.
   *
   * @throws When its id is already registered.
   */
  addLocalExtension(
    extension: LoadedExtension,
    diagnostics: readonly ManifestDiagnostic[]
  ): void;
  /** Disposes a local extension's activation and registrations. */
  removeLocalExtension(id: string): Promise<void>;
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
