/**
 * The vertical band phone overlays may occupy: below the 3.5rem header, all
 * the way to the bottom edge. The inspector drawer bounds its scrim and panel
 * here — the bubbles it sits over are hidden while it is open, so no bottom
 * clearance is reserved. Bubble menus are different: their dismiss layer
 * spans the whole shell (see the menu components) so a tap on the trigger
 * bubble itself also counts as "outside".
 */
export const PHONE_OVERLAY_BOUNDS =
  "top-[calc(3.5rem+env(safe-area-inset-top))] bottom-0";

/**
 * Where bubble menus hang: the 3rem bubble plus its 0.75rem bottom padding
 * plus a 0.75rem gap — 4.5rem in all — then the safe-area inset, so the
 * menu's bottom edge sits just above the bubbles, not above the screen edge.
 */
export const PHONE_BUBBLE_MENU_BOTTOM =
  "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]";
