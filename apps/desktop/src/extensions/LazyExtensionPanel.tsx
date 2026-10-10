import { useEffect, useState, type ReactNode } from "react";

import type { DesktopPanelContext } from "../panels/panelRegistryModel";
import type { DesktopTabContext } from "../tabs/tabRegistry";

/**
 * Stands in for an extension's contribution until that extension is activated.
 *
 * Mounting the placeholder is what makes the activation fire: there is no
 * event bus yet, so "the view was opened" is observed by the surface being
 * rendered. Once activation resolves, the extension has registered the real
 * contribution under the same id and `resolve` returns its output.
 */
interface LazyExtensionSurfaceProps<Context> {
  /** Idempotent activation trigger owned by the bootstrap (or session restore). */
  readonly ensureActive: () => Promise<void>;
  /** Renders the real contribution, valid only after activation resolves. */
  readonly resolve: (context: Context) => ReactNode;
  readonly context: Context;
}

function LazyExtensionSurface<Context>({
  ensureActive,
  resolve,
  context
}: LazyExtensionSurfaceProps<Context>) {
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

  // `resolve` reports a missing contribution as `null` — the extension woke up
  // without registering what the placeholder stood in for. Rendering a bare
  // message beats a silent blank surface.
  const resolved = resolve(context);
  if (resolved === null || resolved === undefined) {
    return (
      <div className="p-4">
        <p className="m-0 text-muted-foreground text-xs" role="alert">
          This extension did not provide the expected content.
        </p>
      </div>
    );
  }
  return <>{resolved}</>;
}

export interface LazyExtensionPanelProps {
  /** Idempotent activation trigger owned by the bootstrap. */
  readonly ensureActive: () => Promise<void>;
  /** Renders the real panel, valid only after activation resolves. */
  readonly resolve: (context: DesktopPanelContext) => ReactNode;
  readonly context: DesktopPanelContext;
}

export function LazyExtensionPanel(props: LazyExtensionPanelProps) {
  return <LazyExtensionSurface {...props} />;
}

/** Factory form, so the bootstrap can stay a plain `.ts` module. */
// eslint-disable-next-line react-refresh/only-export-components -- factory for non-tsx bootstrap
export function createLazyExtensionPanel(props: LazyExtensionPanelProps): ReactNode {
  return <LazyExtensionPanel {...props} />;
}

/**
 * A persisted extension-owned tab kind whose extension is not active yet.
 *
 * Session restore registers a placeholder `DesktopTabView` whose factory mounts
 * this: activation fires on first render (or earlier, when restore kicks it),
 * and `resolve` hands the real view's factory output once the registry has
 * swapped the placeholder out.
 */
export interface LazyExtensionTabProps {
  readonly ensureActive: () => Promise<void>;
  readonly resolve: (context: DesktopTabContext) => ReactNode;
  readonly context: DesktopTabContext;
}

// eslint-disable-next-line react-refresh/only-export-components -- factory for non-tsx restore code
export function createLazyExtensionTab(props: LazyExtensionTabProps): ReactNode {
  return <LazyExtensionSurface {...props} />;
}
