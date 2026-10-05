import { Scrim, useDismissable } from "@thinkbrain/ui";

import type { RightPanel } from "../shellTypes";
import type { RightPanelContext } from "../../panels/panelRegistryModel";
import { RightPopout } from "../../panels/RightPopout";
import { PHONE_OVERLAY_BOUNDS } from "./overlayBounds";
import { cn } from "../../lib/utils";

/** Classes that make the dock-styled `RightPopout` behave as a plain flow
 *  child inside the inspector drawer: the aside loses its fixed positioning,
 *  border and shadow, and its inner dock-width wrapper goes full width. */
const AS_FLOW_CHILD =
  "[&>aside]:static [&>aside]:min-h-0 [&>aside]:flex-1 [&>aside]:border-l-0 [&>aside]:shadow-none [&>aside>div]:w-full";

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
  context,
  onDismiss,
  onBack
}: {
  readonly open: boolean;
  readonly panel: RightPanel;
  /** The right-side context the shell already built for this document. */
  readonly context: RightPanelContext;
  /** Scrim tap: dismisses the inspector (and any flow it belongs to). */
  readonly onDismiss: () => void;
  /** Header Back: steps the flow back to the surface that opened it. */
  readonly onBack: () => void;
}) {
  const { containerRef } = useDismissable({ open, onDismiss });
  return (
    <>
      <Scrim open={open} onDismiss={onDismiss} className={`inset-x-0 ${PHONE_OVERLAY_BOUNDS}`} />
      <div
        ref={containerRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label="Inspector"
        aria-hidden={!open}
        className={cn(
          "absolute right-0 z-50 flex w-[90%] max-w-96 flex-col bg-sidebar text-sidebar-foreground shadow-panel tn-slide",
          PHONE_OVERLAY_BOUNDS,
          open ? "visible translate-x-0" : "invisible translate-x-full"
        )}
      >
        <div className={cn("flex min-h-0 flex-1 flex-col", AS_FLOW_CHILD)}>
          <RightPopout
            panel={panel}
            context={context}
            onBack={onBack}
          />
        </div>
      </div>
    </>
  );
}
