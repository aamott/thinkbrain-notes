import { useEffect, useState, type ReactNode } from "react";

import type { DesktopPanelContext } from "../panels/panelRegistryModel";

/**
 * Stands in for an extension's panel until that extension is activated.
 *
 * Mounting this component is what makes an `onView` activation event fire:
 * there is no event bus yet, so "the view was opened" is observed by the panel
 * being rendered. Once activation resolves, the extension has registered the
 * real panel under the same id and `resolve` returns its output.
 */
export interface LazyExtensionPanelProps {
  /** Idempotent activation trigger owned by the bootstrap. */
  readonly ensureActive: () => Promise<void>;
  /** Renders the real panel, valid only after activation resolves. */
  readonly resolve: (context: DesktopPanelContext) => ReactNode;
  readonly context: DesktopPanelContext;
}

export function LazyExtensionPanel({ ensureActive, resolve, context }: LazyExtensionPanelProps) {
  const [phase, setPhase] = useState<"pending" | "ready" | "failed">("pending");

  useEffect(() => {
    let cancelled = false;
    void ensureActive().then(
      () => {
        if (!cancelled) setPhase("ready");
      },
      () => {
        if (!cancelled) setPhase("failed");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [ensureActive]);

  if (phase === "failed") {
    return (
      <div className="p-4">
        <p className="m-0 text-danger text-xs" role="alert">
          This extension failed to start. See the Extensions panel for details.
        </p>
      </div>
    );
  }

  if (phase === "pending") {
    return (
      <div className="p-4">
        <p className="m-0 text-muted-foreground text-xs">Starting extension…</p>
      </div>
    );
  }

  return <>{resolve(context)}</>;
}

/** Factory form, so the bootstrap can stay a plain `.ts` module. */
// eslint-disable-next-line react-refresh/only-export-components -- factory for non-tsx bootstrap
export function createLazyExtensionPanel(props: LazyExtensionPanelProps): ReactNode {
  return <LazyExtensionPanel {...props} />;
}
