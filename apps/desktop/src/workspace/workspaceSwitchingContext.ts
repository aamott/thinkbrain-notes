import { createContext, useContext } from "react";

import type { WorkspaceSwitchingController } from "./useWorkspaceSwitching";

/**
 * Shared module for the shell-level switching controller, kept out of the
 * component file so `WorkspaceSwitching.tsx` exports only components (the
 * `react-refresh/only-export-components` rule).
 */

/** Where the workspace selector can render. */
export type WorkspaceSelectorVariant = "drawer" | "titlebar" | "panel";

export const WorkspaceSwitchingContext =
  createContext<WorkspaceSwitchingController | null>(null);

/**
 * The shell's one switching controller. Throws rather than returning null: a
 * consumer outside a shell that forgot the provider would otherwise render a
 * dead selector with no diagnostic about why.
 */
export function useWorkspaceSwitchingContext(): WorkspaceSwitchingController {
  const controller = useContext(WorkspaceSwitchingContext);
  if (controller === null) {
    throw new Error(
      "useWorkspaceSwitchingContext must be used under a WorkspaceSwitchingContext.Provider."
    );
  }
  return controller;
}
