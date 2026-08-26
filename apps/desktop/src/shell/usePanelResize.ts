/**
 * Dragging and nudging the side docks.
 *
 * Split out of `DesktopShell` because none of it is composition: it is pointer
 * bookkeeping — capture, three window listeners, a saved `user-select`, and a
 * teardown that has to run whether the drag ends, is cancelled, or the window
 * closes mid-drag. That teardown used to live in the shell's own unmount
 * effect, one file away from the code that installed it; it belongs beside it.
 *
 * Widths themselves are not owned here. The refs come from the lifecycle hook
 * that persists them, so a drag reads the current width without this hook
 * re-rendering on every pixel of movement.
 */

import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import type { PanelSide } from "./shellTypes";

/** How far the arrow keys move a dock, and how far with Shift held. */
const KEYBOARD_STEP = 8;
const KEYBOARD_STEP_WITH_SHIFT = 24;

/** Props for {@link usePanelResize}. */
export interface PanelResizeProps {
  /** Current left width, read at drag start without re-rendering. */
  readonly leftWidthRef: React.RefObject<number>;
  /** Current right width, read the same way. */
  readonly rightWidthRef: React.RefObject<number>;
  /** Applies a new width, clamping and persisting it. */
  readonly updatePanelWidth: (side: PanelSide, width: number) => void;
}

/** The handlers a resize handle needs. */
export interface PanelResize {
  /** `onPointerDown` for a handle: starts a drag. */
  readonly beginResize: (side: PanelSide) => (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /** `onKeyDown` for a handle: arrow keys nudge, Shift nudges further. */
  readonly resizeWithKeyboard: (
    side: PanelSide
  ) => (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  /** Ends any drag in progress. Safe to call when none is. */
  readonly cancelResize: () => void;
}

export function usePanelResize({
  leftWidthRef,
  rightWidthRef,
  updatePanelWidth
}: PanelResizeProps): PanelResize {
  // The teardown for the drag currently in progress, or null when none is.
  // A ref rather than state: nothing renders differently mid-drag, and the
  // pointer handlers below need to reach the latest one without closing over it.
  const cleanupRef = useRef<(() => void) | null>(null);

  const cancelResize = useCallback(() => {
    cleanupRef.current?.();
  }, []);

  // A window closed mid-drag would otherwise leave the listeners and the
  // suppressed text selection behind.
  useEffect(() => () => cleanupRef.current?.(), []);

  /**
   * Starts a pointer-driven dock resize.
   *
   * Captures the pointer on the handle and tracks horizontal movement until the
   * pointer is released or cancelled. Right-side drags are inverted so dragging
   * inward always shrinks the dock.
   */
  const beginResize = useCallback(
    (side: PanelSide) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      cleanupRef.current?.();

      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const start = event.clientX;
      const original = side === "left" ? leftWidthRef.current : rightWidthRef.current;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const move = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - start;
        updatePanelWidth(side, original + (side === "left" ? delta : -delta));
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        document.body.style.userSelect = previousUserSelect;
        // Only if this drag is still the current one: a second drag that began
        // after this finished owns the slot now.
        if (cleanupRef.current === finish) cleanupRef.current = null;
      };

      cleanupRef.current = finish;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [leftWidthRef, rightWidthRef, updatePanelWidth]
  );

  /** Keyboard alternative to dragging a handle. */
  const resizeWithKeyboard = useCallback(
    (side: PanelSide) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const amount = event.shiftKey ? KEYBOARD_STEP_WITH_SHIFT : KEYBOARD_STEP;
      const direction = event.key === "ArrowRight" ? 1 : -1;
      // Inverted on the right for the same reason a drag is: toward the middle
      // is smaller, whichever dock it is.
      const delta = side === "left" ? direction * amount : -direction * amount;
      const current = side === "left" ? leftWidthRef.current : rightWidthRef.current;
      updatePanelWidth(side, current + delta);
    },
    [leftWidthRef, rightWidthRef, updatePanelWidth]
  );

  return { beginResize, resizeWithKeyboard, cancelResize };
}
