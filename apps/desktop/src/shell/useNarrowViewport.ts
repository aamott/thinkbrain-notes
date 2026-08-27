import { useSyncExternalStore } from "react";

/**
 * Whether the viewport is phone-narrow.
 *
 * Pairs with `useCoarsePointer`: width alone cannot tell a 390px popout from a
 * phone, and pointer alone would hand a touchscreen laptop the phone chrome.
 * `usePhoneChrome` requires both.
 */

const QUERY = "(max-width: 760px)";

const query = (): MediaQueryList | null =>
  typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? null
    : window.matchMedia(QUERY);

const subscribe = (onChange: () => void): (() => void) => {
  const list = query();
  if (!list) return () => undefined;
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
};

/** Server-side and on runtimes without the API, assume a wide viewport. */
const getSnapshot = (): boolean => query()?.matches ?? false;

export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
