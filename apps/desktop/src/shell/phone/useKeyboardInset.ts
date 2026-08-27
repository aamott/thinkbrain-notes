import { useCallback, useEffect, useState } from "react";

/**
 * Pixels the soft keyboard covers at the bottom of the layout viewport.
 *
 * `windowSoftInputMode="adjustResize"` shipped with the CodeMirror mobile work,
 * so the webview does resize — but a bottom-anchored hub still needs the number
 * to decide whether it is in the way. Same `visualViewport` approach
 * `MetadataBottomSheet` already uses, lifted out so there is one of it.
 */
export function useKeyboardInset(): number {
  const read = useCallback((): number => {
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!viewport) return 0;
    return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
  }, []);

  const [inset, setInset] = useState(read);

  useEffect(() => {
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!viewport) return;
    const update = (): void => setInset(read());
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [read]);

  return inset;
}
