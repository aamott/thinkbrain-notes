import {
  createContext,
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

export type WorkspaceSelectorVariant = "drawer" | "titlebar" | "panel";

type WorkspaceSelectorOutletRegistration = {
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly variant: WorkspaceSelectorVariant;
};

type WorkspaceSelectorPortalContextValue = {
  readonly register: (outlet: WorkspaceSelectorOutletRegistration) => () => void;
};

const WorkspaceSelectorPortalContext = createContext<WorkspaceSelectorPortalContextValue | null>(null);
const WorkspaceSelectorOutletContext = createContext<WorkspaceSelectorOutletRegistration | null>(null);

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

export function WorkspaceSelectorOutlet({ variant }: { readonly variant: WorkspaceSelectorVariant }) {
  const context = useContext(WorkspaceSelectorPortalContext);
  const id = useId();
  const elementRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!context || !elementRef.current) return;
    return context.register({ id, element: elementRef.current, variant });
  }, [context, id, variant]);

  return (
    <div
      ref={elementRef}
      className={variant === "titlebar" ? "min-w-0 flex-1" : undefined}
      data-workspace-selector-outlet={variant}
    />
  );
}

export function WorkspaceSelectorPortal({
  children
}: {
  readonly children: (variant: WorkspaceSelectorVariant) => ReactNode;
}) {
  const outlet = useContext(WorkspaceSelectorOutletContext);
  // Explorer keeps the real selector so its workspace actions and dialogs share one controller.
  return outlet ? createPortal(children(outlet.variant), outlet.element) : null;
}
