import { type ReactNode } from "react";

import type { LeftPanelContext, RightPanelContext } from "./panelRegistryModel";

/**
 * One panel's slot. A kept-mounted panel keeps its DOM and state; it just
 * toggles `hidden` when its neighbour is the one being opened. Shared by both
 * popouts since the shape is identical (only the context type differs).
 * Not memoized: `React.memo` collapses generic type parameters, and the
 * popouts already memoize the context object so re-renders are bounded.
 *
 * The registry types, built-in panel table, registry instance, lookup helpers,
 * and live-contribution hooks live in `panelRegistryModel.tsx` so this file
 * exports only a React component (`react-refresh/only-export-components`).
 */
export function MountedPanel<Ctx extends LeftPanelContext | RightPanelContext>({
  contribution,
  context,
  isActive,
  isAvailable
}: {
  readonly contribution: { readonly factory: (ctx: Ctx) => ReactNode };
  readonly context: Ctx;
  readonly isActive: boolean;
  readonly isAvailable: boolean;
}) {
  return (
    <div
      className={isActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}
      data-panel-available={isAvailable}
    >
      {contribution.factory(context)}
    </div>
  );
}
