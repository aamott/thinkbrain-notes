import { useEffect, useState, type RefObject } from "react";

export type DiffLayout = "inline" | "split";

/** Below this container width the inline presentation is the default. */
const INLINE_BELOW = 720;

/**
 * The container-width-driven default layout, usable outside the diff itself
 * so a caller drawing its own toggle still gets the same responsive guess.
 * The first answer guesses from the window — better than mounting one engine
 * and immediately replacing it once the observer reports the real width.
 */
export function useResponsiveDiffLayout(
  containerRef: RefObject<HTMLElement | null>
): DiffLayout {
  const [layout, setLayout] = useState<DiffLayout>(() =>
    window.innerWidth < INLINE_BELOW ? "inline" : "split"
  );
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? container.clientWidth;
      setLayout(width < INLINE_BELOW ? "inline" : "split");
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);
  return layout;
}
