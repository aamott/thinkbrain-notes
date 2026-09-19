import { Scrim, useDismissable } from "@thinkbrain/ui";

import type { RightPanel } from "../shellTypes";
import { RightPopout } from "../../panels/RightPopout";
import { cn } from "../../lib/utils";

/** Classes that make the dock-styled `RightPopout` behave as a plain flow
 *  child inside the inspector drawer: the aside loses its fixed positioning,
 *  border and shadow, and its inner dock-width wrapper goes full width. */
const AS_FLOW_CHILD =
  "[&>aside]:static [&>aside]:min-h-0 [&>aside]:flex-1 [&>aside]:border-l-0 [&>aside]:shadow-none [&>aside>div]:w-full";

// The drawer is bounded between the phone header and the bottom hub: the hub
// stays visible and tappable while an inspector is open, matching how the
// navigation drawer and sheets leave the surrounding chrome reachable.
const BOUNDS =
  "top-[calc(3.5rem+env(safe-area-inset-top))] bottom-[calc(3.5rem+env(safe-area-inset-bottom))]";

/**
 * Right-edge inspector drawer for a right-panel contribution (outline,
 * backlinks, properties, extensions). It slides in over part of the note
 * rather than covering it whole, so the content it describes stays partly
 * visible. Selection of
 * *which* panel to show lives upstream (the action-items menu or a hub
 * shortcut); this component only hosts the panel.
 *
 * Always mounted so it can slide in/out via a CSS `transform` transition; when
 * closed it is translated fully off-screen, invisible, and aria-hidden.
 */
export function InspectorSheet({
  open,
  panel,
  rootPath,
  documentContents,
  onDismiss,
  onBack
}: {
  readonly open: boolean;
  readonly panel: RightPanel;
  readonly rootPath: string | null;
  /** Markdown contents of the active editor tab, when its document is ready. */
  readonly documentContents: string | null;
  /** Scrim tap: dismisses the inspector (and any flow it belongs to). */
  readonly onDismiss: () => void;
  /** Header Back: steps the flow back to the surface that opened it. */
  readonly onBack: () => void;
}) {
  const { containerRef } = useDismissable({ open, onDismiss });
  return (
    <>
      <Scrim open={open} onDismiss={onDismiss} className={`inset-x-0 ${BOUNDS}`} />
      <div
        ref={containerRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label="Inspector"
        aria-hidden={!open}
        className={cn(
          "absolute right-0 z-50 flex w-[90%] max-w-96 flex-col bg-sidebar text-sidebar-foreground shadow-panel tn-slide",
          BOUNDS,
          open ? "visible translate-x-0" : "invisible translate-x-full"
        )}
      >
        <div className={cn("flex min-h-0 flex-1 flex-col", AS_FLOW_CHILD)}>
          <RightPopout
            panel={panel}
            rootPath={rootPath}
            documentContents={documentContents}
            onBack={onBack}
          />
        </div>
      </div>
    </>
  );
}
