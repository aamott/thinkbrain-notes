import { useDismissable } from "@thinkbrain/ui";

import type { RightPanel } from "../shellTypes";
import {
  useRightPanelContributions,
  type RightPanelContext
} from "../../panels/panelRegistryModel";
import { PanelIcon } from "../panelIcons";
import { PhoneMenuRow } from "./PhoneMenuRow";
import { handlePhoneMenuKeyDown } from "./phoneMenuKeyboard";
import { PHONE_OVERLAY_BOUNDS } from "./overlayBounds";
import { cn } from "../../lib/utils";

/**
 * The phone's action-items menu — the compact dropdown the header `…` opens,
 * listing every right-panel contribution (version history, outline,
 * properties, backlinks, extension panels) in registry order. This is the
 * drill-in surface for the right-side inspector drawer: choosing an entry
 * opens that panel's inspector.
 *
 * It is intentionally a small anchored menu, not a drawer or bottom sheet:
 * a menu is a quick pick that closes on choice, which is exactly the shape
 * "open the outline for this note" wants. Extension contributions appear with
 * no mobile-specific work because the source is the same
 * `useRightPanelContributions()` the desktop action-items surface reads.
 *
 * Options whose `availability` resolves false stay visible but disabled — a
 * missing action is more confusing than a greyed one.
 */
export function ActionItemsMenu({
  open,
  context,
  onDismiss,
  onSelect
}: {
  readonly open: boolean;
  /** The right-side context the shell already built for this document — the
   *  same object the inspector reads, so availability and contents agree. */
  readonly context: RightPanelContext;
  /** Outside tap or Escape. */
  readonly onDismiss: () => void;
  readonly onSelect: (panel: RightPanel) => void;
}) {
  const { containerRef } = useDismissable({ open, onDismiss });
  const panels = useRightPanelContributions();

  return (
    // One bounded layer doubles as the undimmed outside-dismiss target; the
    // compact menu hangs inside it at the top-right and sizes to its content,
    // so a short list does not stretch header-to-hub.
    <div
      aria-hidden={!open}
      className={cn(
        "absolute inset-x-0 z-40",
        PHONE_OVERLAY_BOUNDS,
        open ? "visible" : "invisible"
      )}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={containerRef}
        role={open ? "menu" : undefined}
        aria-label="Action items"
        onKeyDown={handlePhoneMenuKeyDown}
        className="absolute top-0 right-2 max-h-full w-60 overflow-y-auto rounded-medium border border-border bg-surface py-1 text-foreground shadow-panel"
      >
        {panels.map((entry) => {
          const available = entry.availability?.(context) ?? true;
          return (
            <PhoneMenuRow
              key={entry.id}
              icon={<PanelIcon name={entry.icon} />}
              label={entry.label}
              disabled={!available}
              onSelect={() => onSelect(entry.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
