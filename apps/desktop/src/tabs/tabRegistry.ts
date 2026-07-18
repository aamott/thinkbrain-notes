import {
  createTabRegistry,
  type TabKind,
  type TabRegistration
} from "@thinkbrain/core";

/**
 * A renderer-neutral description of a tab surface. React components are bound
 * by the shell, so extensions can describe a view without importing React.
 */
export interface DesktopTabView extends TabRegistration {
  readonly availability: "available" | "unavailable";
  readonly unavailableMessage?: string;
}

export interface DesktopTabRegistry {
  register(view: DesktopTabView): void;
  get(kind: TabKind): DesktopTabView | undefined;
  entries(): readonly DesktopTabView[];
}

export const builtInDesktopTabViews: readonly DesktopTabView[] = [
  {
    kind: "editor",
    label: "Markdown editor",
    isAvailable: true,
    availability: "available"
  },
  {
    kind: "preview",
    label: "Markdown preview",
    isAvailable: true,
    availability: "available"
  },
  {
    kind: "settings",
    label: "Settings",
    isAvailable: true,
    availability: "available"
  },
  {
    kind: "graph",
    label: "Graph",
    isAvailable: false,
    availability: "unavailable",
    unavailableMessage: "Graph visualization is unavailable until link indexing is connected."
  },
  {
    kind: "browser",
    label: "Browser",
    isAvailable: false,
    availability: "unavailable",
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

  const register = (view: DesktopTabView): void => {
    const registration: TabRegistration = {
      kind: view.kind,
      label: view.label,
      isAvailable: view.isAvailable
    };
    coreRegistry.register(registration);
    views.set(view.kind, view);
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
    }
  };
}
