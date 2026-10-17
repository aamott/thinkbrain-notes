import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { DesktopTab } from "../tabs/tabModel";

export const crossedTabDragThreshold = (dx: number, dy: number): boolean => Math.hypot(dx, dy) >= 6;

export interface TabSlot {
  readonly id: string;
  readonly left: number;
  readonly width: number;
}

/** Slots stay in content coordinates, unaffected by scrolling or preview transforms. */
export function tabDragTarget(slots: readonly TabSlot[], tabId: string, center: number): number {
  return slots.filter((slot) => slot.id !== tabId && center > slot.left + slot.width / 2).length;
}

export function tabEdgeScroll(x: number, left: number, right: number): number {
  const edge = Math.min(36, (right - left) / 2);
  if (edge <= 0) return 0;
  if (x < left + edge) return -Math.min(1, (left + edge - x) / edge) * 12;
  if (x > right - edge) return Math.min(1, (x - right + edge) / edge) * 12;
  return 0;
}

interface Preview {
  readonly tabId: string;
  readonly from: number;
  readonly to: number;
  readonly dx: number;
  readonly stride: number;
}

export function useTabStripDrag(
  stripRef: RefObject<HTMLElement | null>,
  tabs: readonly DesktopTab[],
  onReorder: (tabId: string, toIndex: number) => void
) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const suppressedUntil = useRef(0);
  const reorderRef = useRef(onReorder);
  useEffect(() => { reorderRef.current = onReorder; }, [onReorder]);
  useEffect(() => () => cleanupRef.current?.(), [tabs]);

  const onPointerDown = (event: ReactPointerEvent, tabId: string) => {
    if (event.button !== 0 || !["mouse", "pen"].includes(event.pointerType) || tabs.length < 2) return;
    cleanupRef.current?.();
    const strip = stripRef.current;
    if (!strip) return;
    const slots = Array.from(strip.querySelectorAll<HTMLElement>("[data-tab-id]"), (element) => ({
      id: element.dataset.tabId!,
      left: element.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft,
      width: element.getBoundingClientRect().width
    }));
    const from = slots.findIndex((slot) => slot.id === tabId);
    const source = slots[from];
    if (!source) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const startScroll = strip.scrollLeft;
    let x = startX;
    let dragging = false;
    let to = from;
    let frame = 0;
    const previousUserSelect = document.body.style.userSelect;

    const update = () => {
      const dx = x - startX + strip.scrollLeft - startScroll;
      to = tabDragTarget(slots, tabId, source.left + source.width / 2 + dx);
      const gap = Number.parseFloat(getComputedStyle(strip).columnGap) || 0;
      const stride = source.width + gap;
      setPreview((previous) =>
        previous?.tabId === tabId && previous.to === to && previous.dx === dx && previous.stride === stride
          ? previous : { tabId, from, to, dx, stride }
      );
    };
    const tick = () => {
      const rect = strip.getBoundingClientRect();
      strip.scrollLeft += tabEdgeScroll(x, rect.left, rect.right);
      update();
      frame = requestAnimationFrame(tick);
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      document.body.style.userSelect = previousUserSelect;
      if (dragging) suppressedUntil.current = performance.now() + 400;
      setPreview(null);
      cleanupRef.current = null;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      x = e.clientX;
      if (!dragging && crossedTabDragThreshold(x - startX, e.clientY - startY)) {
        dragging = true;
        document.body.style.userSelect = "none";
        frame = requestAnimationFrame(tick);
      }
      if (!dragging) return;
      e.preventDefault();
      update();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (dragging) {
        x = e.clientX;
        update();
        e.preventDefault();
        reorderRef.current(tabId, to);
      }
      cleanup();
    };
    const cancel = (e: Event) => {
      if (e instanceof PointerEvent && e.pointerId !== pointerId) return;
      cleanup();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
      }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    cleanupRef.current = cleanup;
  };

  const tabStyle = (index: number): CSSProperties | undefined => {
    if (!preview) return undefined;
    const { from, to, dx, stride } = preview;
    const offset = index === from ? dx
      : from < index && index <= to ? -stride
      : to <= index && index < from ? stride : 0;
    return {
      transform: `translateX(${offset}px)`,
      transition: index === from ? "none" : "transform 150ms ease"
    };
  };

  return {
    draggedTabId: preview?.tabId ?? null,
    onPointerDown,
    tabStyle,
    suppressClick: () => performance.now() < suppressedUntil.current
  };
}
