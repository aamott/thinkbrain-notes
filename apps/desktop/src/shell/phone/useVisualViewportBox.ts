import { useEffect, useState } from "react";

/** The visual viewport's box inside the layout viewport, in CSS pixels. */
export interface VisualViewportBox {
  readonly height: number;
  readonly offsetTop: number;
}

/**
 * The visual viewport's box, or `null` when it is not a faithful stand-in for
 * the layout viewport.
 *
 * On Android 15+ (targetSdk 36) `enableEdgeToEdge()` makes the WebView
 * edge-to-edge, and edge-to-edge apps no longer get `adjustResize`: the
 * layout viewport stays full height while only the *visual* viewport shrinks
 * for the soft keyboard. `block-size: 100%` roots never see that shrink, and
 * the visual viewport can also *pan* inside the layout viewport
 * (`offsetTop > 0`) — the browser's substitute for scrolling. `PhoneShell`
 * pins its root to this box so the shell tracks both the shrink and the pan
 * and only the active tab's content scrolls.
 *
 * Two caveats shape the return value:
 *
 * - Pinch-zoom also shrinks the visual viewport, but zoomed content must keep
 *   its full layout size or the shell would collapse to the zoomed box. A
 *   `scale` away from 1 therefore returns `null` and the shell falls back to
 *   `h-full`.
 * - The browser can still pan the layout viewport itself (focus-scroll,
 *   scroll-into-view), which is the whole-app scroll this hook exists to
 *   prevent. Any nonzero `window.scrollX/scrollY` is cancelled back to the
 *   origin while scale is ~1.
 */
export function useVisualViewportBox(): VisualViewportBox | null {
  const read = (): VisualViewportBox | null => {
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!viewport || Math.abs(viewport.scale - 1) >= 0.01) return null;
    return {
      height: Math.round(viewport.height),
      offsetTop: Math.max(0, Math.round(viewport.offsetTop))
    };
  };

  const [box, setBox] = useState<VisualViewportBox | null>(read);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = (): void => {
      const next = read();
      setBox((prev) =>
        prev === next || (prev !== null && next !== null && prev.height === next.height && prev.offsetTop === next.offsetTop)
          ? prev
          : next
      );
      if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) >= 0.01) return;
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, []);

  return box;
}
