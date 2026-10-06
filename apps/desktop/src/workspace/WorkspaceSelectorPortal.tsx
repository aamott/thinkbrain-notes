import {
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";

import {
  WorkspaceSelectorOutletContext,
  WorkspaceSelectorPortalContext,
  type WorkspaceSelectorOutletRegistration,
  type WorkspaceSelectorVariant
} from "./WorkspaceSelectorPortalModel";

export type { WorkspaceSelectorVariant };

export function WorkspaceSelectorProvider({ children }: { readonly children: ReactNode }) {
  const [outlet, setOutlet] = useState<WorkspaceSelectorOutletRegistration | null>(null);
  const register = useCallback((next: WorkspaceSelectorOutletRegistration) => {
    setOutlet(next);
    return () => setOutlet((current) => current?.id === next.id ? null : current);
  }, []);
  const value = useMemo(() => ({ register }), [register]);

  return (
    <WorkspaceSelectorPortalContext.Provider value={value}>
      <WorkspaceSelectorOutletContext.Provider value={outlet}>
        {children}
      </WorkspaceSelectorOutletContext.Provider>
    </WorkspaceSelectorPortalContext.Provider>
  );
}

export function WorkspaceSelectorOutlet({
  variant,
  onAction
}: {
  readonly variant: WorkspaceSelectorVariant;
  readonly onAction?: () => void;
}) {
  const context = useContext(WorkspaceSelectorPortalContext);
  const id = useId();
  const elementRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!context || !elementRef.current) return;
    return context.register({ id, element: elementRef.current, variant, onAction });
  }, [context, id, variant, onAction]);

  // Titlebar and panel outlets fill their flex parent (the title-bar stretch,
  // the popout title slot); the drawer outlet stacks in a column flow.
  const fillsParent = variant === "titlebar" || variant === "panel";
  return (
    <div
      ref={elementRef}
      className={fillsParent ? "flex min-w-0 flex-1 items-center" : undefined}
      data-workspace-selector-outlet={variant}
    />
  );
}

export function WorkspaceSelectorPortal({
  children
}: {
  readonly children: (variant: WorkspaceSelectorVariant, onAction?: () => void) => ReactNode;
}) {
  const outlet = useContext(WorkspaceSelectorOutletContext);
  // Explorer keeps the real selector so its workspace actions and dialogs share one controller.
  return outlet ? createPortal(children(outlet.variant, outlet.onAction), outlet.element) : null;
}
