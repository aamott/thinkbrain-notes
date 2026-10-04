import { useMediaQuery } from "../lib/useMediaQuery";

/**
 * Whether the viewport is phone-narrow.
 *
 * Pairs with `useCoarsePointer`: width alone cannot tell a 390px popout from a
 * phone, and pointer alone would hand a touchscreen laptop the phone chrome.
 * `usePhoneChrome` requires both.
 */
export function useNarrowViewport(): boolean {
  return useMediaQuery("(max-width: 760px)");
}
