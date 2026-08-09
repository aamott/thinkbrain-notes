import { useSyncExternalStore } from "react";

/**
 * Whether the primary pointer is a fingertip (D76).
 *
 * Touch decides the phone treatments, not width: a full-screen popout is about
 * 390px across and so is a wide desktop panel, so a width query cannot tell one
 * from the other. What differs is the pointer, and a 26px row that is fine
 * under a mouse is half the touch minimum under a thumb.
 *
 * Where the treatment is only visual, prefer the `pointer-coarse:` utility and
 * leave the DOM alone; this hook is for the cases where the structure itself
 * differs, such as the metadata sheet standing in for the inline editor.
 */

const QUERY = "(pointer: coarse)";

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

/** Server-side and on runtimes without the API, assume a mouse. */
const getSnapshot = (): boolean => query()?.matches ?? false;

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
