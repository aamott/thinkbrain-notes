import type { Disposable } from "../lifecycle";

/**
 * Platform-neutral metadata for a workspace tab. Desktop and future clients
 * supply their own renderers; this package deliberately has no UI dependency.
 */
export type BuiltInTabKind =
  | "editor"
  | "preview"
  | "settings"
  | "graph"
  | "browser";

/** Allows extension-owned kinds while retaining first-party autocomplete. */
export type TabKind = BuiltInTabKind | (string & {});

export interface TabResource {
  readonly rootPath?: string;
  readonly relativePath?: string;
}

export interface Tab {
  readonly id: string;
  readonly title: string;
  readonly kind: TabKind;
  readonly resource?: TabResource;
  readonly isDirty?: boolean;
}

export interface LayoutPreferences {
  readonly tabs: readonly Tab[];
  readonly activeTabId: string | null;
}

/** Metadata an extension contributes before a client binds it to a renderer. */
export interface TabRegistration {
  readonly kind: TabKind;
  readonly label: string;
  readonly isAvailable: boolean;
}

export interface TabRegistry {
  /** Registers a tab kind and returns a handle that unregisters it. */
  register(registration: TabRegistration): Disposable;
  get(kind: TabKind): TabRegistration | undefined;
  entries(): readonly TabRegistration[];
}

/**
 * Small registry contract shared by hosts and extension contribution adapters.
 * Duplicate kinds are rejected so ownership stays explicit.
 *
 * Registration is revocable because an extension's activation scope owns every
 * contribution it makes and must be able to give all of them back.
 */
export function createTabRegistry(): TabRegistry {
  const registrations = new Map<TabKind, TabRegistration>();

  return {
    register(registration) {
      if (registrations.has(registration.kind)) {
        throw new Error(`A tab renderer is already registered for ${registration.kind}.`);
      }

      registrations.set(registration.kind, registration);
      let disposed = false;

      return {
        dispose: (): void => {
          if (disposed) return;
          disposed = true;
          // Only remove our own registration: a later owner of the same kind
          // must survive a late dispose of the earlier handle.
          if (registrations.get(registration.kind) === registration) {
            registrations.delete(registration.kind);
          }
        }
      };
    },
    get(kind) {
      return registrations.get(kind);
    },
    entries() {
      return [...registrations.values()];
    }
  };
}
