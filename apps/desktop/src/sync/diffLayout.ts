import { useEffect, useState, type RefObject } from "react";

export type DiffLayout = "inline" | "split";

/** Below this container width the inline presentation is the default. */
const INLINE_BELOW = 720;

/**
 * The container-width-driven default layout, usable outside the diff itself
 * so a caller drawing its own toggle still gets the same responsive guess.
 * Returns null until the container has been measured.
 */
export function useResponsiveDiffLayout(
  containerRef: RefObject<HTMLElement | null>
): DiffLayout | null {
  const [layout, setLayout] = useState<DiffLayout | null>(() =>
    typeof ResizeObserver === "function" || window.innerWidth >= INLINE_BELOW
      ? null
      : "inline"
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
