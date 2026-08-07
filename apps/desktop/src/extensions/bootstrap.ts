import {
  createDisposableStore,
  evaluateCompatibility,
  hasStartupActivation,
  parseExtensionManifest,
  type CompatibilityHost,
  type CompatibilityReason,
  type Disposable,
  type ExtensionManifest
} from "@thinkbrain/core";

import { desktopCommandRegistry, type DesktopCommandContext } from "../commands/commandRegistry";
import { desktopPanelRegistry, type DesktopPanelContext } from "../panels/panelRegistry";
import { builtInExtensions, type BuiltInExtension } from "./builtins";
import { desktopExtensionHost, type DesktopExtensionHost } from "./desktopExtensionHost";
import { createLazyExtensionPanel } from "./LazyExtensionPanel";
import {
  getExtensionBootstrap as getExtensionBootstrapInternal,
  setExtensionBootstrap,
  type BootstrapEntry,
  type BootstrapEntryStatus,
  type ExtensionBootstrap
} from "./bootstrapRef";

export type { BootstrapEntry, BootstrapEntryStatus, ExtensionBootstrap } from "./bootstrapRef";
export { getExtensionBootstrap } from "./bootstrapRef";

/**
 * Registers built-in extensions and activates them lazily.
 *
 * Manifest-declared commands and panels are registered as **stubs** before any
 * extension code runs, so the palette and activity bar look complete from the
 * first frame. Touching a stub activates its extension, which registers the
 * real contribution under the same id.
 *
 * This MUST run before the first React render. The command and panel registries
 * are not reactive — nothing subscribes to them — so a contribution added after
 * the first render would not appear until an unrelated re-render. For the same
 * reason a stub and its real counterpart share id, label, icon, and side: the
 * rendered list never changes shape, only the factory behind it.
 */

/** The extension API version this host implements. */
export const HOST_API_VERSION = "1.0.0";

export interface BootstrapOptions {
  readonly host?: DesktopExtensionHost;
  readonly extensions?: readonly BuiltInExtension[];
  readonly commands?: typeof desktopCommandRegistry;
  readonly panels?: typeof desktopPanelRegistry;
  readonly compatibilityHost?: CompatibilityHost;
}

const DEFAULT_COMPATIBILITY_HOST: CompatibilityHost = {
  apiVersion: HOST_API_VERSION,
  platform: "desktop",
  capabilities: ["commands", "panels", "editorHooks", "settings"]
};

interface EntryState {
  readonly manifest: ExtensionManifest;
  status: BootstrapEntryStatus;
  reasons: readonly CompatibilityReason[];
  /** Stub registrations, disposed immediately before activation. */
  stubs: Disposable[];
  activation: Promise<void> | undefined;
}

export function bootstrapExtensions(options: BootstrapOptions = {}): ExtensionBootstrap {
  const host = options.host ?? desktopExtensionHost;
  const commands = options.commands ?? desktopCommandRegistry;
  const panels = options.panels ?? desktopPanelRegistry;
  const compatibilityHost = options.compatibilityHost ?? DEFAULT_COMPATIBILITY_HOST;
  const extensions = options.extensions ?? builtInExtensions;

  const store = createDisposableStore();
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  let snapshot: readonly BootstrapEntry[] = [];
  const states = new Map<string, EntryState>();
  const failedManifests: BootstrapEntry[] = [];

  const disposeStubs = (state: EntryState): void => {
    for (const stub of state.stubs) stub.dispose();
    state.stubs = [];
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
        rebuildSnapshot();
        console.error(`[extensions] Failed to activate "${state.manifest.id}".`, error);
        throw error;
      });

    state.activation = activation;
    return activation;
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
        reasons: diagnostics.map((diagnostic) => ({
          code: "capability" as const,
          message: diagnostic.message,
          severity: diagnostic.severity
        }))
      });
      continue;
    }

    const compatibility = evaluateCompatibility(manifest, compatibilityHost);
    const state: EntryState = {
      manifest,
      status: compatibility.compatible ? "registered" : "incompatible",
      reasons: compatibility.reasons,
      stubs: [],
      activation: undefined
    };
    states.set(manifest.id, state);

    if (!compatibility.compatible) {
      // Listed in the Extensions panel with its reasons, but contributes
      // nothing: an incompatible extension must not put dead entries in the
      // palette or activity bar.
      continue;
    }

    store.add(host.register({ id: manifest.id, activate: extension.activate }));

    if (hasStartupActivation(manifest)) {
      void ensureActive(state).catch(() => undefined);
      continue;
    }

    for (const command of manifest.contributes.commands) {
      const fullId = `${manifest.id}.${command.id}`;
      const stub = commands.register({
        id: fullId,
        title: command.title,
        availability: "available",
        handler: async (context: DesktopCommandContext): Promise<void> => {
          await ensureActive(state);
          const real = commands.get(fullId);
          if (real) await real.handler(context);
        }
      });
      state.stubs.push(stub);
      store.add(stub);
    }

    for (const panel of manifest.contributes.panels) {
      const fullId = `${manifest.id}.${panel.id}`;
      const stub = panels.register({
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
            resolve: (resolveContext) => panels.get(fullId)?.factory(resolveContext) ?? null,
            context: panelContext
          })
      });
      state.stubs.push(stub);
      store.add(stub);
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
        reasons: state.reasons
      })),
      ...failedManifests
    ];
    notify();
  }

  rebuildSnapshot();

  const bootstrap: ExtensionBootstrap = {
    entries: (): readonly BootstrapEntry[] => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      if (getExtensionBootstrapInternal() === bootstrap) setExtensionBootstrap(null);
      return store.dispose();
    }
  };

  // Only the default (app-wide) bootstrap is published; an injected-registry
  // bootstrap in a test must not become the one the Extensions panel reads.
  if (!options.commands && !options.panels && !options.host) setExtensionBootstrap(bootstrap);

  return bootstrap;
}
