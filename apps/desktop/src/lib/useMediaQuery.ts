import { useCallback, useSyncExternalStore } from "react";

/** The `MediaQueryList` for `query`, or null where the API is absent. */
export const mediaQueryList = (query: string): MediaQueryList | null =>
  typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? null
    : window.matchMedia(query);

/**
 * Whether a CSS media query currently matches, tracked live.
 *
 * `useSyncExternalStore` subscribes to the query's `change` event, so the
 * component re-renders when the answer flips. On a runtime without the API
 * (SSR, a very old webview) the answer stays `false`.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = mediaQueryList(query);
    if (!mql) return () => undefined;
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  const getSnapshot = useCallback(() => mediaQueryList(query)?.matches ?? false, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
