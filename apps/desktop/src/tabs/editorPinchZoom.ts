/**
 * Two-finger pinch → `editor.fontSize` for the CodeMirror editors.
 *
 * The controller owns exactly one shape of gesture: two touches that both
 * start inside the editor's scroller. Everything else — one finger, mixed
 * origins, a third finger, a touchcancel, a hidden tab — either never arms
 * or cancels without writing. The only persisted output is a single rounded
 * `editor.fontSize` commit at gesture end; moves only preview through the
 * host's transform seam.
 *
 * Arbitration: while a gesture is owned or draining the scroller's
 * `overflow` is locked to `hidden` and every owned touch event is
 * preventDefaulted + stopPropagated in the capture phase — the two-finger
 * pan belongs to this controller, not the browser's scroller. One-finger
 * scrolling is untouched: `touch-action` stays `pan-x pan-y` and no
 * prevention happens outside an owned session.
 */

import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { EDITOR_FONT_SIZE_MAX, EDITOR_FONT_SIZE_MIN } from "./editorDisplaySettings";

/** Where the document should sit relative to the live gesture midpoint. */
export interface PinchAnchor {
  /** Document position under the midpoint at gesture start. */
  readonly pos: number;
  /** Rendered char-rect delta captured at start: `rect.left - mid.x`. */
  readonly offsetX: number;
  /** Rendered char-rect delta captured at start: `rect.top - mid.y`. */
  readonly offsetY: number;
  /** Gesture midpoint at capture time. */
  readonly startX: number;
  readonly startY: number;
  /** Current gesture midpoint — follows the fingers during a move. */
  x: number;
  y: number;
}

/** The host (useCodeMirrorView) supplies the display seams. */
export interface EditorPinchControls {
  /** Latest effective baseline font size (px). */
  getFontSize: () => number;
  /** Applies a preview size and re-anchors: `size` may be fractional. */
  preview: (size: number, anchor: PinchAnchor) => void;
  /** Restores the baseline display after a cancelled gesture. */
  cancel: () => void;
  /**
   * Applies the committed size to the live view (re-landing `anchor.pos`
   * under the final midpoint) AND persists it — called at most once.
   */
  commit: (size: number, anchor: PinchAnchor) => void;
}

export interface EditorPinchZoomHandle {
  setEnabled: (enabled: boolean) => void;
  cancel: () => void;
  destroy: () => void;
  /** True while an owned two-finger session is live or draining. */
  readonly ownsTouchGesture: boolean;
}

const MIN_START_SPAN = 8;
/** Preview only kicks in past a 5% span change — jitter is not a font change. */
const SPAN_THRESHOLD = 0.05;

type Phase = "idle" | "pinching" | "draining";

interface TrackedTouch {
  x: number;
  y: number;
}

const clampFont = (size: number): number =>
  Math.min(EDITOR_FONT_SIZE_MAX, Math.max(EDITOR_FONT_SIZE_MIN, size));

/**
 * Installs the gesture policy on `view.scrollDOM`. `touch-action` is
 * narrowed to `pan-x pan-y` while enabled so the element never delegates
 * two fingers to the browser's page zoom — those belong to this controller.
 */
export function installEditorPinchZoom(
  view: EditorView,
  controls: EditorPinchControls,
  enabled: boolean
): EditorPinchZoomHandle {
  const scroller = view.scrollDOM;
  const savedTouchAction = scroller.style.touchAction;

  let phase: Phase = "idle";
  let isEnabled = enabled;
  /** Bumped on every start/cancel/destroy so stale RAFs no-op. */
  let generation = 0;
  let rafId = 0;
  /** The two owned fingers; other active ids are drained, never tracked. */
  const tracked = new Map<number, TrackedTouch>();
  let startSpan = 0;
  let startFontSize = 0;
  let startDoc: unknown = null;
  let anchor: PinchAnchor | null = null;
  let startScrollTop = 0;
  let startScrollLeft = 0;
  let previewSize = 0;
  let pendingSpan = 0;
  let committed = false;
  /**
   * Commit decided at first lift but executed only once every finger is
   * up: the reflow rebuilds the line DOM, and a finger still down has its
   * touch target locked to the node it landed on — rebuilding that subtree
   * while it is down would detach the target and strand the drain
   * (unobservable end, scroll stuck locked). The `.cm-editor` transform
   * preview stays applied through the drain instead.
   */
  let pendingCommit: { size: number; anchor: PinchAnchor } | null = null;
  /** Swallow the click Chrome synthesizes from a drained gesture tail. */
  let suppressClick = false;
  /** Scroll lock held while owned/draining. */
  let savedOverflow: { overflow: string; overflowX: string; overflowY: string } | null =
    null;

  const applyTouchAction = (): void => {
    scroller.style.touchAction = isEnabled ? "pan-x pan-y" : savedTouchAction;
  };

  const lockScroll = (): void => {
    if (savedOverflow !== null) return;
    savedOverflow = {
      overflow: scroller.style.overflow,
      overflowX: scroller.style.overflowX,
      overflowY: scroller.style.overflowY
    };
    scroller.style.overflow = "hidden";
  };

  const unlockScroll = (): void => {
    if (savedOverflow === null) return;
    scroller.style.overflow = savedOverflow.overflow;
    scroller.style.overflowX = savedOverflow.overflowX;
    scroller.style.overflowY = savedOverflow.overflowY;
    savedOverflow = null;
  };

  const midpoint = (a: TrackedTouch, b: TrackedTouch): { x: number; y: number } => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  });

  const span = (a: TrackedTouch, b: TrackedTouch): number =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const captureAnchor = (x: number, y: number): PinchAnchor | null => {
    const base = { offsetX: 0, offsetY: 0, startX: x, startY: y, x, y };
    const pos = view.posAtCoords({ x, y }, false);
    if (pos !== null) {
      try {
        const rect = view.coordsAtPos(pos);
        if (rect) {
          return { ...base, pos, offsetX: rect.left - x, offsetY: rect.top - y };
        }
      } catch {
        // Position not laid out — fall through to the line-block anchor.
      }
    }
    // Fall back to the line block at the midpoint height and treat its top
    // as the anchor line (position virtualized or unmeasured).
    const block = view.lineBlockAtHeight(y - view.documentTop);
    return { ...base, pos: block.from, offsetY: block.top + view.documentTop - y };
  };

  const flushPreview = (): void => {
    if (phase !== "pinching" || !anchor) return;
    if (view.state.doc !== startDoc) {
      // The document moved under the gesture — cancel rather than re-anchor
      // a stale position onto different content.
      cancelSession();
      return;
    }
    const rel = pendingSpan / startSpan;
    // Inside the threshold the preview snaps back to the baseline, so a
    // gesture that shrinks home again commits nothing.
    previewSize =
      Math.abs(rel - 1) <= SPAN_THRESHOLD ? startFontSize : clampFont(startFontSize * rel);
    controls.preview(previewSize, anchor);
  };

  const schedulePreview = (): void => {
    if (rafId !== 0) return;
    const gen = generation;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (gen !== generation || phase !== "pinching") return;
      flushPreview();
    });
  };

  const restoreBaseline = (): void => {
    controls.cancel();
    // A document change may have come from elsewhere; don't fight it by
    // jamming an old scroll position back on a different document.
    if (view.state.doc === startDoc) {
      scroller.scrollTop = startScrollTop;
      scroller.scrollLeft = startScrollLeft;
    }
  };

  const cancelSession = (): void => {
    if (phase === "idle") return;
    const wasPinching = phase === "pinching";
    const hadPendingCommit = pendingCommit !== null;
    pendingCommit = null;
    generation++;
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (wasPinching || hadPendingCommit) restoreBaseline();
    anchor = null;
    // Fingers still down drain to zero so the browser can't reinterpret
    // them as a fresh scroll or click.
    phase = "draining";
    suppressClick = true;
  };

  const commitEnd = (): void => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    flushPreview();
    // A doc change may have cancelled us mid-flush — never commit then.
    if (phase !== "pinching") return;
    const finalAnchor = anchor ? { ...anchor } : null;
    anchor = null;
    phase = "draining";
    suppressClick = true;
    const rounded = Math.round(previewSize);
    if (!committed && finalAnchor !== null && rounded !== Math.round(startFontSize)) {
      committed = true;
      // Executed when the drain finishes — see `pendingCommit` above.
      pendingCommit = { size: rounded, anchor: finalAnchor };
    } else {
      // No effective change: restore the baseline display rather than
      // leaving a leftover transform on the view.
      restoreBaseline();
    }
  };

  const settleToIdle = (): void => {
    tracked.clear();
    phase = "idle";
    unlockScroll();
    const commit = pendingCommit;
    pendingCommit = null;
    // Fingers are all up — the reflow can safely rebuild the line DOM now.
    // A document swapped in during the drain voids the commit (its anchor
    // positions are stale); clear the preview without writing instead.
    if (commit && view.state.doc === startDoc) controls.commit(commit.size, commit.anchor);
    else if (commit) controls.cancel();
  };

  const swallow = (event: TouchEvent): void => {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  };

  const onTouchStart = (event: TouchEvent): void => {
    if (phase !== "idle") {
      // A third finger joining mid-gesture: cancel, then drain the rest.
      if (phase === "pinching") cancelSession();
      swallow(event);
      return;
    }
    // A brand-new finger sequence is independent of any drained gesture —
    // leftover click suppression must never eat a genuine tap.
    suppressClick = false;
    if (!isEnabled) return;
    if (event.touches.length !== 2) return;
    // A page zoom already in flight (or accessibility magnification) mixes
    // coordinate systems — leave that gesture to the platform.
    if (window.visualViewport && window.visualViewport.scale !== 1) return;
    const [t0, t1] = [event.touches[0], event.touches[1]];
    if (!t0 || !t1) return;
    if (!scroller.contains(t0.target as Node) || !scroller.contains(t1.target as Node)) return;
    if (view.state.facet(EditorState.readOnly)) return;
    const d = span({ x: t0.clientX, y: t0.clientY }, { x: t1.clientX, y: t1.clientY });
    if (d < MIN_START_SPAN) return;

    tracked.set(t0.identifier, { x: t0.clientX, y: t0.clientY });
    tracked.set(t1.identifier, { x: t1.clientX, y: t1.clientY });
    const mid = midpoint(tracked.get(t0.identifier)!, tracked.get(t1.identifier)!);
    anchor = captureAnchor(mid.x, mid.y);
    if (!anchor) {
      tracked.clear();
      return;
    }
    startSpan = d;
    startFontSize = controls.getFontSize();
    previewSize = startFontSize;
    pendingSpan = d;
    startDoc = view.state.doc;
    startScrollTop = scroller.scrollTop;
    startScrollLeft = scroller.scrollLeft;
    committed = false;
    generation++;
    phase = "pinching";
    lockScroll();
    swallow(event);
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (phase === "idle") return;
    if (phase === "draining") {
      swallow(event);
      return;
    }
    // An owned pair whose original identifiers vanished or were replaced is
    // a gesture we no longer control — cancel rather than arbitrate it.
    for (const id of tracked.keys()) {
      if (!Array.from(event.touches).some((t) => t.identifier === id)) {
        cancelSession();
        swallow(event);
        return;
      }
    }
    const had = tracked.size === 2;
    updateTracked(event);
    if (!had || tracked.size !== 2) return;
    swallow(event);
    schedulePreview();
  };

  const updateTracked = (event: TouchEvent): void => {
    for (const touch of Array.from(event.changedTouches)) {
      const entry = tracked.get(touch.identifier);
      if (entry) {
        entry.x = touch.clientX;
        entry.y = touch.clientY;
      }
    }
    if (tracked.size !== 2) return;
    const [a, b] = [...tracked.values()] as [TrackedTouch, TrackedTouch];
    pendingSpan = span(a, b);
    const mid = midpoint(a, b);
    if (anchor) {
      anchor.x = mid.x;
      anchor.y = mid.y;
    }
  };

  const onTouchEnd = (event: TouchEvent): void => {
    if (phase === "idle") return;
    if (event.type === "touchcancel") {
      // Carries no points — the whole sequence is void.
      cancelSession();
      settleToIdle();
      return;
    }
    if (phase === "draining") {
      swallow(event);
      if (event.touches.length === 0) settleToIdle();
      return;
    }
    // A lifted finger's last coordinates still count toward the final span.
    updateTracked(event);
    let liftedTracked = false;
    for (const touch of Array.from(event.changedTouches)) {
      if (tracked.delete(touch.identifier)) liftedTracked = true;
    }
    if (!liftedTracked) return;
    if (view.state.doc !== startDoc) {
      cancelSession();
      swallow(event);
      if (event.touches.length === 0) settleToIdle();
      return;
    }
    swallow(event);
    // First lift ends the gesture: flush any queued preview, commit once,
    // then drain the remaining finger's events until all are up. Both
    // fingers may lift in one event — settle immediately then.
    commitEnd();
    if (event.touches.length === 0) settleToIdle();
  };

  // Swallow clicks/taps synthesized from the tail of an owned gesture so a
  // lifted pinch can never produce a phantom selection or button hit. The
  // flag is one-shot: a real pointer (mouse) or the next fresh touch
  // sequence clears it, so genuine taps are never eaten.
  const suppressWhileOwned = (event: Event): void => {
    if (phase !== "idle" || suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }
  };
  const clearSuppressionOnMouse = (event: Event): void => {
    if ((event as PointerEvent).pointerType === "mouse") suppressClick = false;
  };

  const LISTEN = { passive: false, capture: true } as const;
  scroller.addEventListener("touchstart", onTouchStart, LISTEN);
  scroller.addEventListener("touchmove", onTouchMove, LISTEN);
  scroller.addEventListener("touchend", onTouchEnd, LISTEN);
  scroller.addEventListener("touchcancel", onTouchEnd, LISTEN);
  scroller.addEventListener("click", suppressWhileOwned, true);
  scroller.addEventListener("pointerdown", clearSuppressionOnMouse, true);
  applyTouchAction();

  const handle: EditorPinchZoomHandle = {
    get ownsTouchGesture() {
      return phase !== "idle";
    },
    setEnabled(next: boolean): void {
      if (next === isEnabled) return;
      isEnabled = next;
      if (!next) {
        // Disarm outright — a hidden editor should not keep draining a
        // gesture it can no longer observe.
        cancelSession();
        settleToIdle();
      }
      applyTouchAction();
    },
    cancel(): void {
      // External cancellation (preference/doc change, unmount) still
      // drains remaining fingers — forcing idle would let the browser
      // reinterpret them as a fresh scroll or click.
      cancelSession();
    },
    destroy(): void {
      // Restore the baseline display while the view is still attached —
      // a parked scroll snapshot taken after this must not see the
      // transform preview. Teardown forces idle; it can't drain fingers.
      handle.cancel();
      settleToIdle();
      generation++;
      if (rafId !== 0) cancelAnimationFrame(rafId);
      scroller.removeEventListener("touchstart", onTouchStart, true);
      scroller.removeEventListener("touchmove", onTouchMove, true);
      scroller.removeEventListener("touchend", onTouchEnd, true);
      scroller.removeEventListener("touchcancel", onTouchEnd, true);
      scroller.removeEventListener("click", suppressWhileOwned, true);
      scroller.removeEventListener("pointerdown", clearSuppressionOnMouse, true);
      scroller.style.touchAction = savedTouchAction;
      anchor = null;
    }
  };
  return handle;
}
