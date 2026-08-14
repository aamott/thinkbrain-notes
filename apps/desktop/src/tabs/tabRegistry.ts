import {
  createTabRegistry,
  type Disposable,
  type TabKind,
  type TabRegistration
} from "@thinkbrain/core";
import type { ReactNode } from "react";

/** What a contributed tab renderer is given when the shell draws it. */
export interface DesktopTabContext {
  /** Current workspace root, or `null` before a workspace is opened. */
  readonly rootPath: string | null;
  /** Identifier of the tab being rendered. */
  readonly tabId: string;
}

/**
 * A description of a tab surface.
 *
 * Built-in kinds are drawn by the shell, which knows how to supply an editor
 * its document state. A contributed kind must bring its own `factory`: without
 * one the shell has nothing to draw and the tab would fall through to the
 * Markdown editor branch and report a missing document.
 */
export interface DesktopTabView extends TabRegistration {
  readonly unavailableMessage?: string;
  readonly factory?: (context: DesktopTabContext) => ReactNode;
}

export interface DesktopTabRegistry {
  /** Registers a tab kind and returns a handle that unregisters it. */
  register(view: DesktopTabView): Disposable;
  get(kind: TabKind): DesktopTabView | undefined;
  entries(): readonly DesktopTabView[];
  /** Observes registrations and disposals. */
  subscribe(listener: () => void): () => void;
}

export const builtInDesktopTabViews: readonly DesktopTabView[] = [
  {
    kind: "editor",
    label: "Markdown editor",
    isAvailable: true
  },
  {
    kind: "preview",
    label: "Markdown preview",
    isAvailable: true
  },
  {
    kind: "settings",
    label: "Settings",
    isAvailable: true
  },
  {
    kind: "graph",
    label: "Graph",
    isAvailable: false,
    unavailableMessage: "Graph visualization is unavailable until link indexing is connected."
  },
  {
    kind: "browser",
    label: "Browser",
    isAvailable: false,
    unavailableMessage: "Browser tabs are unavailable until the desktop web view is connected."
  }
];

/**
 * Keeps extension registration at the metadata boundary. The shell remains
 * responsible for associating a registered kind with its React renderer.
 */
export function createDesktopTabRegistry(
  initialViews: readonly DesktopTabView[] = builtInDesktopTabViews
): DesktopTabRegistry {
  const coreRegistry = createTabRegistry();
  const views = new Map<TabKind, DesktopTabView>();
  const listeners = new Set<() => void>();

  const changed = (): void => {
    for (const listener of listeners) listener();
  };

  const register = (view: DesktopTabView): Disposable => {
    const registration: TabRegistration = {
      kind: view.kind,
      label: view.label,
      isAvailable: view.isAvailable
    };
    const coreHandle = coreRegistry.register(registration);
    views.set(view.kind, view);
    changed();
    let disposed = false;

    return {
      dispose: (): void => {
        if (disposed) return;
        disposed = true;
        coreHandle.dispose();
        // Only drop our own view: a later owner of the same kind must survive
        // a late dispose of the earlier handle.
        if (views.get(view.kind) === view) views.delete(view.kind);
        changed();
      }
    };
  };

  initialViews.forEach(register);

  return {
    register,
    get(kind) {
      // Delegate the existence check to the platform-neutral registry so its
      // duplicate-kind ownership invariant remains the single source of truth.
      return coreRegistry.get(kind) ? views.get(kind) : undefined;
    },
    entries() {
      return [...views.values()];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

/**
 * Shared registry consumed by the shell and by extension contributions.
 *
 * A singleton because a contributed kind is useless if the surface that draws
 * tabs holds a different instance from the one an extension registered into.
 */
export const desktopTabRegistry = createDesktopTabRegistry();
