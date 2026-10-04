/**
 * The vertical band phone overlays may occupy: below the 3.5rem header, above
 * the 3.5rem bottom hub. Menus, sheets, and the inspector drawer all bound
 * their dismiss layers and surfaces here so the surrounding chrome stays
 * visible and tappable — tapping the ⋯ slot toggles the menu, and the hub
 * keeps working while an inspector is open.
 */
export const PHONE_OVERLAY_BOUNDS =
  "top-[calc(3.5rem+env(safe-area-inset-top))] bottom-[calc(3.5rem+env(safe-area-inset-bottom))]";
