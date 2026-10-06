import { createContext, useContext } from "react";

/**
 * Context plumbing for the workspace-selector portal, kept in a non-component
 * module so `WorkspaceSelectorPortal.tsx` exports only components (the
 * `react-refresh/only-export-components` rule).
 */

export type WorkspaceSelectorVariant = "drawer" | "titlebar" | "panel";

export interface WorkspaceSelectorOutletRegistration {
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly variant: WorkspaceSelectorVariant;
  readonly onAction?: () => void;
}

export interface WorkspaceSelectorPortalContextValue {
  readonly register: (outlet: WorkspaceSelectorOutletRegistration) => () => void;
}

export const WorkspaceSelectorPortalContext =
  createContext<WorkspaceSelectorPortalContextValue | null>(null);
export const WorkspaceSelectorOutletContext =
  createContext<WorkspaceSelectorOutletRegistration | null>(null);

/**
 * The currently registered outlet, if any. Panels that render the selector
 * into their own chrome (the explorer) read this to stand down while another
 * panel's title slot is hosting it.
 */
export function useWorkspaceSelectorOutlet(): WorkspaceSelectorOutletRegistration | null {
  return useContext(WorkspaceSelectorOutletContext);
}
