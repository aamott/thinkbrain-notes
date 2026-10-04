import { useMediaQuery } from "../lib/useMediaQuery";

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
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}
