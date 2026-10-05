import type { ReactNode } from "react";

import { useDismissable } from "@thinkbrain/ui";

import { cn } from "../../lib/utils";
import { handleMenuKeyDown } from "../menuKeyboard";
import { PHONE_BUBBLE_MENU_BOTTOM } from "./overlayBounds";

/**
 * The shared surface every bubble-anchored phone menu is built on: a
 * full-shell dismiss layer carrying the menu container that hangs just above
 * the bubbles.
 *
 * The layer doubles as the undimmed outside-dismiss target and spans the
 * whole shell — bubbles included — so a tap on the trigger bubble while the
 * menu is open closes it rather than immediately reopening it. The menu is
 * anchored to `PHONE_BUBBLE_MENU_BOTTOM` and height-capped so a long list can
 * never reach up over the header.
 *
 * Stacking: the layer is z-40 and the menu z-50 — the same bands the
 * sheets' scrims and panels occupy, so DOM order keeps the later-rendered
 * overlay on top (menus sit under the drawer and inspector, and the layer
 * stays above the z-20 bubbles it is there to intercept).
 *
 * Escape is not wired into the keydown handler on purpose: the menu is
 * registered in `useDismissable`'s overlay stack, whose document listener
 * owns it. Roving arrow/Home/End focus is handled here.
 */
export function BubbleMenuShell({
  name,
  label,
  open,
  menuClassName,
  onDismiss,
  children
}: {
  /**
   * Identifies this menu's dismiss layer (`data-tn-dismiss-layer`) so tests
   * can hit it without depending on class names or DOM order.
   */
  readonly name: string;
  /** The menu's accessible name. */
  readonly label: string;
  readonly open: boolean;
  /** Anchor side, width and padding for the menu container. */
  readonly menuClassName?: string;
  /** Outside tap (Escape is owned by the dismissable stack). */
  readonly onDismiss: () => void;
  /** The menu's rows — `PhoneMenuRow`s. */
  readonly children: ReactNode;
}) {
  const { containerRef } = useDismissable({ open, onDismiss });

  return (
    // Always mounted, matching the sheets: `open` drives visibility and the
    // `menu` role rather than mounting, so the surface animates and closes
    // the same way as every other overlay on this chrome.
    <div
      data-tn-dismiss-layer={name}
      aria-hidden={!open}
      className={cn("absolute inset-0 z-40", open ? "visible" : "invisible")}
      onPointerDown={(event) => {
        // Only direct hits on the layer dismiss — taps on the menu inside it
        // bubble up with a different target and are filtered out.
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={containerRef}
        role={open ? "menu" : undefined}
        aria-label={label}
        onKeyDown={(event) => handleMenuKeyDown(event, event.currentTarget)}
        className={cn(
          "absolute z-50 overflow-y-auto rounded-medium border border-border bg-surface text-foreground shadow-panel",
          PHONE_BUBBLE_MENU_BOTTOM,
          // Bottom-anchored and growing upward: cap the height so a long
          // registry can never reach up over the header.
          "max-h-[calc(100%-8rem)]",
          menuClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
