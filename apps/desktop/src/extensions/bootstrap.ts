import {
  DisposableError,
  evaluateCompatibility,
  hasStartupActivation,
  parseExtensionManifest,
  type CompatibilityHost,
  type Disposable,
  type ExtensionManifest,
  type ManifestDiagnostic
} from "@thinkbrain/core";

import { desktopCommandRegistry, type DesktopCommandContext } from "../commands/commandRegistry";
import {
  mobileNewNoteActionRegistry,
  type MobileNewNoteActionRegistry
} from "../commands/mobileNewNoteActionRegistry";
import { desktopPanelRegistry, type DesktopPanelContext } from "../panels/panelRegistryModel";
import { builtInExtensions, type BuiltInExtension } from "./builtins";
import {
  desktopExtensionHost,
  qualifyContributionId,
  type DesktopExtensionActivation,
  type DesktopExtensionContext,
  type DesktopExtensionHost
} from "./desktopExtensionHost";
import { HOST_COMPATIBILITY } from "./hostCompatibility";
import { createLazyExtensionPanel } from "./LazyExtensionPanel";
import {
  getExtensionBootstrap as getExtensionBootstrapInternal,
  setExtensionBootstrap,
  type BootstrapEntry,
  type BootstrapEntryStatus,
  type BootstrapReason,
  type ExtensionSource,
  type ExtensionBootstrap
} from "./bootstrapRef";

/** Maps manifest diagnostics to bootstrap reasons (used for failed manifests and load diagnostics). */
const toReasons = (diagnostics: readonly ManifestDiagnostic[]): readonly BootstrapReason[] =>
  diagnostics.map((d) => ({ code: d.code, message: d.message, severity: d.severity }));

/**
 * Registers built-in extensions and activates them lazily.
 *
 * Manifest-declared commands and panels are registered as **stubs** before any
 * extension code runs, so the palette and activity bar look complete from the
 * first frame. Touching a stub activates its extension, which registers the
 * real contribution under the same id.
 *
 * A stub and its real counterpart share id, label, icon, and side, so swapping
 * one for the other never changes the shape of the rendered list.
 *
 * Extensions can also be added while the app runs — see `addLocalExtension` —
 * which the shell picks up through the registries' subscriptions.
 */

export interface BootstrapOptions {
  readonly host?: DesktopExtensionHost;
  readonly extensions?: readonly BuiltInExtension[];
  readonly commands?: typeof desktopCommandRegistry;
  readonly panels?: typeof desktopPanelRegistry;
  readonly mobileNewNoteActions?: MobileNewNoteActionRegistry;
  readonly compatibilityHost?: CompatibilityHost;
  /**
   * Whether this bootstrap becomes the app-wide singleton the Extensions
   * panel reads.
   *
   * When omitted, the historical convention holds: only a bootstrap built
   * entirely from the module defaults (no injected host or registries)
   * publishes itself. Passing `publish` explicitly opts a partially injected
   * bootstrap in — or a default-configured one out — without guessing from
   * which other options happened to be set.
   */
  readonly publish?: boolean;
}

interface EntryState {
  readonly manifest: ExtensionManifest;
  readonly source: ExtensionSource;
  readonly directory: string | undefined;
  status: BootstrapEntryStatus;
  reasons: readonly BootstrapReason[];
  /** Stub registrations, disposed immediately before activation. */
  stubs: Disposable[];
  /**
   * New-note action registrations. Unlike command stubs these persist through
   * activation: the row survives while its command stub swaps to the real
   * command, and is removed only on activation failure or disposal.
   */
  mobileNewNoteActionRegistrations: Disposable[];
  /** Host registration handle; disposing it also deactivates the extension. */
  registration: Disposable | null;
  activation: Promise<void> | undefined;
}

export function bootstrapExtensions(options: BootstrapOptions = {}): ExtensionBootstrap {
  const host = options.host ?? desktopExtensionHost;
  const commands = options.commands ?? desktopCommandRegistry;
  const panels = options.panels ?? desktopPanelRegistry;
  const newNoteActions = options.mobileNewNoteActions ?? mobileNewNoteActionRegistry;
  const compatibilityHost = options.compatibilityHost ?? HOST_COMPATIBILITY;
  const extensions = options.extensions ?? builtInExtensions;

  const listeners = new Set<() => void>();
  let snapshot: readonly BootstrapEntry[] = [];
  const states = new Map<string, EntryState>();
  const failedManifests: BootstrapEntry[] = [];

  const disposeStubs = (state: EntryState): void => {
    for (const stub of state.stubs) stub.dispose();
    state.stubs = [];
  };

  const disposeActionRegistrations = (state: EntryState): void => {
    for (const registration of state.mobileNewNoteActionRegistrations) registration.dispose();
    state.mobileNewNoteActionRegistrations = [];
  };

  /**
   * Activates an extension at most once.
   *
   * Stubs are disposed *before* activation so the extension's own registration
   * of the same id does not collide with them. On failure the stubs stay gone:
   * re-registering would offer the user a contribution that only fails again.
   */
  const ensureActive = (state: EntryState): Promise<void> => {
    if (state.activation) return state.activation;

    disposeStubs(state);
    const activation = host
      .activate(state.manifest.id)
      .then(() => {
        state.status = host.status(state.manifest.id) ?? "active";
        rebuildSnapshot();
      })
      .catch((error: unknown) => {
        state.status = "failed";
        // A failed extension's New-note rows are dead ends; drop them.
        disposeActionRegistrations(state);
        rebuildSnapshot();
        console.error(`[extensions] Failed to activate "${state.manifest.id}".`, error);
        throw error;
      });

    state.activation = activation;
    return activation;
  };

  /**
   * Registers a stub for every contribution the manifest declares.
   *
   * Identical for both sources: a built-in fulfils a panel stub with a React
   * factory and a local extension with a mount function, but both arrive in the
   * registry under the same id and the same shape.
   */
  const registerStubs = (state: EntryState): void => {
    for (const command of state.manifest.contributes.commands) {
      const fullId = qualifyContributionId(state.manifest.id, command.id);
      state.stubs.push(
        commands.register({
          id: fullId,
          title: command.title,
          availability: "available",
          handler: async (context: DesktopCommandContext): Promise<void> => {
            await ensureActive(state);
            const real = commands.get(fullId);
            if (real) {
              await real.handler(context);
              return;
            }
            // The extension activated but never registered a command its
            // manifest declared — an authoring bug that deserves a diagnostic,
            // not a silent no-op.
            console.error(
              `[extensions] "${state.manifest.id}" activated but never registered declared command "${fullId}".`
            );
          }
        })
      );
    }

    for (const panel of state.manifest.contributes.panels) {
      const fullId = qualifyContributionId(state.manifest.id, panel.id);
      state.stubs.push(
        panels.register({
          id: fullId,
          label: panel.label,
          icon: panel.icon,
          side: panel.side,
          factory: (panelContext: DesktopPanelContext) =>
            createLazyExtensionPanel({
              ensureActive: () => ensureActive(state),
              // Only ever called after activation resolves, by which point the
              // stub has been disposed and `get` returns the extension's real
              // panel. Calling it earlier would re-enter this same factory.
              resolve: (resolveContext) => {
                const real = panels.get(fullId);
                if (!real) {
                  // Same authoring bug as a missing command: the manifest
                  // promised this panel and activation did not provide it.
                  console.error(
                    `[extensions] "${state.manifest.id}" activated but never registered declared panel "${fullId}".`
                  );
                  return null;
                }
                return real.factory(resolveContext);
              },
              context: panelContext
            })
        })
      );
    }
  };

  /** Registers with the host, then activates on startup or installs stubs. */
  const registerAndStub = (
    state: EntryState,
    activate: DesktopExtensionActivation,
    deactivate?: (context: DesktopExtensionContext) => void | Promise<void>,
    newNoteActionsForEntry?: BuiltInExtension["mobileNewNoteActions"]
  ): void => {
    // Descriptor contributions, registered before any activation so the popup
    // is complete from the first frame — like command stubs, but surviving
    // activation because they only point at the command.
    try {
      for (const action of newNoteActionsForEntry ?? []) {
        state.mobileNewNoteActionRegistrations.push(
          newNoteActions.register({
            id: qualifyContributionId(state.manifest.id, action.id),
            commandId: qualifyContributionId(state.manifest.id, action.commandId),
            label: action.label,
            icon: action.icon,
            requiresWorkspace: action.requiresWorkspace
          })
        );
      }
      state.registration = host.register({ id: state.manifest.id, activate, deactivate });
      if (!hasStartupActivation(state.manifest)) {
        registerStubs(state);
      }
    } catch (error) {
      // Transactional: a duplicate or a failed registration anywhere in the
      // sequence must not leave stubs, action rows, or the host registration
      // behind — the caller either drops the whole entry or aborts bootstrap.
      disposeStubs(state);
      disposeActionRegistrations(state);
      const registration = state.registration;
      state.registration = null;
      if (registration) {
        // Nothing was ever activated, so disposal only unregisters — but it is
        // still async, and this rollback runs inside a sync signature.
        void Promise.resolve(registration.dispose()).catch((disposeError: unknown) => {
          console.error(
            `[extensions] Failed to roll back registration for "${state.manifest.id}".`,
            disposeError
          );
        });
      }
      throw error;
    }
    if (hasStartupActivation(state.manifest)) {
      void ensureActive(state).catch(() => undefined);
    }
  };

  /** Disposes everything one extension owns, in reverse of registration. */
  const disposeEntry = async (state: EntryState): Promise<void> => {
    disposeStubs(state);
    disposeActionRegistrations(state);
    // The host's registration handle awaits any in-flight activation and
    // deactivates before unregistering, so the activation scope — and every
    // command, panel, and setting it owned — is gone when this resolves.
    await state.registration?.dispose();
    state.registration = null;
    state.activation = undefined;
  };

  for (const extension of extensions) {
    // Re-parse even a statically authored manifest: built-ins must satisfy the
    // same contract third-party extensions will, and a typo should surface here
    // rather than as a confusing runtime failure.
    const { manifest, diagnostics } = parseExtensionManifest(extension.manifest);
    if (!manifest) {
      failedManifests.push({
        id: extension.manifest.id || "(unknown)",
        name: extension.manifest.name || "(invalid manifest)",
        status: "incompatible",
        source: "built-in",
        reasons: toReasons(diagnostics)
      });
      continue;
    }

    const compatibility = evaluateCompatibility(manifest, compatibilityHost);
    const state: EntryState = {
      manifest,
      source: "built-in",
      directory: undefined,
      status: compatibility.compatible ? "registered" : "incompatible",
      reasons: compatibility.reasons,
      stubs: [],
      mobileNewNoteActionRegistrations: [],
      registration: null,
      activation: undefined
    };
    states.set(manifest.id, state);

    if (!compatibility.compatible) {
      // Listed in the Extensions panel with its reasons, but contributes
      // nothing: an incompatible extension must not put dead entries in the
      // palette or activity bar.
      continue;
    }

    try {
      registerAndStub(state, extension.activate, undefined, extension.mobileNewNoteActions);
    } catch (error) {
      // Bootstrap is about to throw, so there will be no bootstrap object to
      // dispose through. Tear down every earlier extension's stubs and host
      // registrations before rethrowing or they stay live in the global
      // registries forever.
      for (const earlier of states.values()) {
        disposeStubs(earlier);
        disposeActionRegistrations(earlier);
        void Promise.resolve(earlier.registration?.dispose()).catch(() => undefined);
        earlier.registration = null;
      }
      states.clear();
      throw error;
    }
  }

  // A cached snapshot keeps `entries()` referentially stable between changes,
  // which useSyncExternalStore requires to avoid an infinite render loop.
  function rebuildSnapshot(): void {
    snapshot = [
      ...[...states.values()].map((state) => ({
        id: state.manifest.id,
        name: state.manifest.name,
        status: state.status,
        reasons: state.reasons,
        source: state.source,
        ...(state.directory === undefined ? {} : { directory: state.directory })
      })),
      ...failedManifests
    ];
    for (const listener of listeners) listener();
  }

  rebuildSnapshot();

  const bootstrap: ExtensionBootstrap = {
    entries: (): readonly BootstrapEntry[] => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    activateAll: async (): Promise<void> => {
      await Promise.all(
        [...states.values()]
          .filter((state) => state.status !== "incompatible" && state.registration !== null)
          // One extension failing to activate must not cost the user the
          // settings of every other one, so failures are already recorded on
          // the entry and are swallowed here.
          .map((state) => ensureActive(state).catch(() => undefined))
      );
    },

    addLocalExtension: (extension, diagnostics): void => {
      if (states.has(extension.manifest.id)) {
        throw new Error(`Extension "${extension.manifest.id}" is already registered.`);
      }

      // The gate lives here, not only in the loader: `addLocalExtension` is
      // the registry boundary, so any future producer of a `LoadedExtension`
      // that skips the loader is still held to the platform/apiVersion check.
      const compatibility = evaluateCompatibility(extension.manifest, compatibilityHost);
      const state: EntryState = {
        manifest: extension.manifest,
        source: "local-directory",
        directory: extension.directory,
        status: compatibility.compatible ? "registered" : "incompatible",
        // Load diagnostics ride along as reasons so the Extensions panel shows
        // an author why, for example, a declared panel did not appear.
        reasons: [...toReasons(diagnostics), ...compatibility.reasons],
        stubs: [],
        mobileNewNoteActionRegistrations: [],
        registration: null,
        activation: undefined
      };
      states.set(state.manifest.id, state);

      if (!compatibility.compatible) {
        // Same rule as a built-in: listed with its reasons, but contributes
        // nothing — an incompatible extension must not put dead entries in
        // the palette or activity bar.
        rebuildSnapshot();
        return;
      }

      try {
        registerAndStub(state, extension.activate, extension.deactivate);
      } catch (error) {
        // Roll the entry back out so a retry after the user fixes the
        // extension is not blocked by an invisible half-registration
        // `entries()` never listed.
        states.delete(state.manifest.id);
        throw error;
      }

      rebuildSnapshot();
    },

    removeLocalExtension: async (id: string): Promise<void> => {
      const state = states.get(id);
      if (!state) return;

      await disposeEntry(state);
      states.delete(id);
      rebuildSnapshot();
    },

    dispose: async () => {
      if (getExtensionBootstrapInternal() === bootstrap) setExtensionBootstrap(null);
      // One extension's failed teardown must not strand the rest: every entry
      // is disposed in order, errors are collected, and the aggregate is
      // thrown only after cleanup has run to completion.
      const errors: unknown[] = [];
      try {
        for (const state of states.values()) {
          try {
            await disposeEntry(state);
          } catch (error) {
            errors.push(error);
            console.error(`[extensions] Failed to dispose "${state.manifest.id}".`, error);
          }
        }
      } finally {
        states.clear();
        // Empty the published snapshot too: a cached `entries()` must not keep
        // reporting extensions whose registrations are all gone.
        failedManifests.length = 0;
        rebuildSnapshot();
      }
      if (errors.length > 0) {
        throw new DisposableError(errors);
      }
    }
  };

  // Publication is explicit: a bootstrap is the app-wide singleton only when
  // asked (or, by convention, when built entirely from the module defaults).
  // An injected-registry bootstrap in a test must not become the one the
  // Extensions panel reads.
  const publish =
    options.publish ??
    (!options.commands && !options.panels && !options.host && !options.mobileNewNoteActions);
  if (publish) {
    setExtensionBootstrap(bootstrap);
  }

  return bootstrap;
}
