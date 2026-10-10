// @vitest-environment happy-dom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import {
  installEditorPinchZoom,
  type EditorPinchControls,
  type EditorPinchZoomHandle,
  type PinchAnchor
} from "./editorPinchZoom";

/**
 * Structural touches: happy-dom has no Touch/TouchList constructors, so the
 * listener-facing fields (`touches`, `changedTouches`, per-touch `target`)
 * are attached to a plain cancelable Event. `dispatchEvent` still exercises
 * the real listener path, including `preventDefault`/`defaultPrevented`.
 */
interface FakeTouch {
  readonly identifier: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly target: EventTarget;
}

const touch = (identifier: number, x: number, y: number, target: EventTarget): FakeTouch => ({
  identifier,
  clientX: x,
  clientY: y,
  target
});

let view: EditorView;
let scroller: HTMLElement;
let handle: EditorPinchZoomHandle;
let previews: number[];
let cancels: number;
let commits: { size: number; anchor: PinchAnchor }[];
let fontSize: number;
let outside: HTMLElement;

const fireTouch = (
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  touches: readonly FakeTouch[],
  changed: readonly FakeTouch[] = touches
): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "changedTouches", { value: changed });
  scroller.dispatchEvent(event);
  return event;
};

/** Two tracked fingers plus the live `touches` list for a move/end event. */
const twoFinger = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): [FakeTouch, FakeTouch] => [
  touch(1, a.x, a.y, view.contentDOM),
  touch(2, b.x, b.y, view.contentDOM)
];

const startPinch = (): FakeTouch[] => {
  const touches = twoFinger({ x: 100, y: 100 }, { x: 100, y: 200 }); // span 100
  fireTouch("touchstart", touches);
  return touches;
};

const moveTo = (spanPx: number): void => {
  const [a, b] = twoFinger({ x: 100, y: 150 - spanPx / 2 }, { x: 100, y: 150 + spanPx / 2 });
  fireTouch("touchmove", [a, b], [a, b]);
};

const flushFrames = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 30));
};

const setup = (enabled = true): void => {
  fontSize = 16;
  previews = [];
  commits = [];
  cancels = 0;
  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView({
    parent: host,
    state: EditorState.create({ doc: "hello\n".repeat(50) })
  });
  scroller = view.scrollDOM;
  outside = document.createElement("button");
  document.body.appendChild(outside);
  const controls: EditorPinchControls = {
    getFontSize: () => fontSize,
    preview: (size: number) => {
      previews.push(size);
    },
    cancel: () => {
      cancels++;
    },
    commit: (size: number, anchor: PinchAnchor) => {
      commits.push({ size, anchor });
    }
  };
  handle = installEditorPinchZoom(view, controls, enabled);
};

afterEach(() => {
  handle?.destroy();
  view?.destroy();
  document.body.innerHTML = "";
});

describe("installEditorPinchZoom", () => {
  it("ignores single-finger touches entirely", async () => {
    setup();
    const start = fireTouch("touchstart", [touch(1, 100, 100, view.contentDOM)]);
    fireTouch("touchmove", [touch(1, 100, 150, view.contentDOM)]);
    fireTouch("touchend", [], [touch(1, 100, 150, view.contentDOM)]);
    await flushFrames();
    expect(start.defaultPrevented).toBe(false);
    expect(previews).toEqual([]);
    expect(commits).toEqual([]);
    expect(handle.ownsTouchGesture).toBe(false);
  });

  it("previews a bounded spread, writes once on first lift", async () => {
    setup();
    const start = fireTouch("touchstart", twoFinger({ x: 100, y: 100 }, { x: 100, y: 200 }));
    expect(start.defaultPrevented).toBe(true);
    expect(handle.ownsTouchGesture).toBe(true);
    expect(scroller.style.touchAction).toBe("pan-x pan-y");
    // The gesture owns the two-finger pan — the scroller is locked.
    expect(scroller.style.overflow).toBe("hidden");

    moveTo(200); // 2× → 32px cap from 16
    moveTo(240); // beyond the cap, still bounded
    moveTo(160); // 1.6×
    await flushFrames();
    expect(previews.length).toBeGreaterThan(0);
    expect(Math.max(...previews)).toBeLessThanOrEqual(32);
    expect(commits).toEqual([]); // moves never write

    // First lift decides the commit (160/100 = 1.6× → round(25.6) = 26)
    // but the write waits for the drain: reflowing now would detach the
    // other finger's touch target and strand the lock.
    const remaining = touch(2, 100, 230, view.contentDOM);
    fireTouch("touchend", [remaining], [touch(1, 100, 70, view.contentDOM)]);
    expect(commits).toEqual([]);
    expect(handle.ownsTouchGesture).toBe(true); // draining the other finger

    // Second lift: drain ends, the single commit executes, lock released.
    fireTouch("touchend", [], [remaining]);
    expect(commits.map((c) => c.size)).toEqual([26]);
    expect(handle.ownsTouchGesture).toBe(false);
    expect(scroller.style.overflow).toBe("");
  });

  it("passes the final midpoint and document position to commit", async () => {
    setup();
    startPinch(); // midpoint (100, 150)
    moveTo(160);
    await flushFrames();
    const remaining = touch(2, 100, 230, view.contentDOM);
    fireTouch("touchend", [remaining], [touch(1, 100, 70, view.contentDOM)]);
    fireTouch("touchend", [], [remaining]);
    expect(commits.length).toBe(1);
    const { anchor } = commits[0]!;
    // midpoint stays (100, 150) through moveTo's symmetric spread
    expect(anchor.x).toBe(100);
    expect(anchor.y).toBe(150);
    expect(anchor.startX).toBe(100);
    expect(anchor.startY).toBe(150);
    expect(anchor.pos).toBeGreaterThanOrEqual(0);
  });

  it("does not write when the span never crossed the threshold", async () => {
    setup();
    startPinch();
    moveTo(103); // under 5% → preview holds the baseline
    await flushFrames();
    // Both fingers lift at their last positions — a real end event reports
    // final coordinates, which still count toward the final span.
    fireTouch("touchend", [], twoFinger({ x: 100, y: 98.5 }, { x: 100, y: 201.5 }));
    expect(previews.every((s) => s === 16)).toBe(true);
    expect(commits).toEqual([]);
    expect(scroller.style.overflow).toBe("");
  });

  it("writes nothing when the rounded size is unchanged", async () => {
    setup();
    startPinch();
    moveTo(110); // 1.1× → preview 17.6, commits round to 18
    await flushFrames();
    // Back to ~16 before lifting: preview 16.32 → rounds to 16 → no write.
    moveTo(102);
    await flushFrames();
    // First finger lifts at its last position; the other drains out.
    fireTouch("touchend", [touch(2, 100, 201, view.contentDOM)], [touch(1, 100, 99, view.contentDOM)]);
    fireTouch("touchend", [], [touch(2, 100, 201, view.contentDOM)]);
    expect(commits).toEqual([]);
    // No-change end restores the baseline display and the scroll lock.
    expect(cancels).toBe(1);
    expect(scroller.style.overflow).toBe("");
  });

  it("cancels when an original touch identifier disappears mid-gesture", async () => {
    setup();
    startPinch();
    moveTo(160);
    await flushFrames();
    // Identifier 2 is gone; a new finger can't silently replace it.
    fireTouch("touchmove", [
      touch(1, 100, 100, view.contentDOM),
      touch(9, 100, 200, view.contentDOM)
    ]);
    expect(cancels).toBe(1);
    expect(handle.ownsTouchGesture).toBe(true); // drains until all fingers up
    fireTouch("touchend", [], [touch(1, 0, 0, view.contentDOM)]);
    fireTouch("touchend", [], [touch(9, 0, 0, view.contentDOM)]);
    expect(commits).toEqual([]);
    expect(handle.ownsTouchGesture).toBe(false);
  });

  it("ignores a two-finger start below the minimum span", () => {
    setup();
    const start = fireTouch("touchstart", twoFinger({ x: 100, y: 100 }, { x: 100, y: 104 }));
    expect(start.defaultPrevented).toBe(false);
    expect(handle.ownsTouchGesture).toBe(false);
  });

  it("rejects gestures with a touch originating outside the scroller", () => {
    setup();
    const start = fireTouch("touchstart", [
      touch(1, 100, 100, view.contentDOM),
      touch(2, 100, 200, outside)
    ]);
    expect(start.defaultPrevented).toBe(false);
    expect(handle.ownsTouchGesture).toBe(false);
  });

  it("does not arm while disabled", () => {
    setup(false);
    const start = fireTouch("touchstart", twoFinger({ x: 100, y: 100 }, { x: 100, y: 200 }));
    expect(start.defaultPrevented).toBe(false);
    expect(scroller.style.touchAction).not.toBe("pan-x pan-y");
  });

  it("a third finger cancels and drains without committing", async () => {
    setup();
    startPinch();
    moveTo(200);
    await flushFrames();
    expect(previews.length).toBeGreaterThan(0);

    fireTouch("touchstart", [
      ...twoFinger({ x: 100, y: 100 }, { x: 100, y: 200 }),
      touch(3, 50, 50, view.contentDOM)
    ]);
    expect(cancels).toBe(1);
    expect(handle.ownsTouchGesture).toBe(true); // still draining

    fireTouch("touchend", [], twoFinger({ x: 0, y: 0 }, { x: 0, y: 0 }));
    fireTouch("touchend", [], []);
    expect(commits).toEqual([]);
    expect(handle.ownsTouchGesture).toBe(false);
  });

  it("touchcancel restores the baseline and never commits", async () => {
    setup();
    startPinch();
    moveTo(200);
    await flushFrames();
    fireTouch("touchcancel", [], startPinchTouches());
    expect(cancels).toBe(1);
    expect(commits).toEqual([]);
    expect(handle.ownsTouchGesture).toBe(false);
  });

  it("disabling mid-gesture cancels", async () => {
    setup();
    startPinch();
    moveTo(200);
    await flushFrames();
    handle.setEnabled(false);
    expect(cancels).toBe(1);
    expect(commits).toEqual([]);
    // Re-enabling starts clean.
    handle.setEnabled(true);
    expect(handle.ownsTouchGesture).toBe(false);
  });

  it("a document change during the gesture cancels instead of committing", async () => {
    setup();
    startPinch();
    moveTo(160);
    await flushFrames();
    view.dispatch({ changes: { from: 0, insert: "external edit\n" } });
    moveTo(200); // next move sees the changed doc
    await flushFrames();
    fireTouch("touchend", [], twoFinger({ x: 100, y: 100 }, { x: 100, y: 200 }));
    expect(cancels).toBe(1);
    expect(commits).toEqual([]);
  });

  it("external cancel keeps draining fingers; a fresh tap afterwards is not eaten", async () => {
    setup();
    startPinch();
    moveTo(200);
    await flushFrames();
    handle.cancel();
    expect(cancels).toBe(1);
    expect(handle.ownsTouchGesture).toBe(true); // draining, not idle
    // Fingers still down: their events are swallowed, not reinterpreted.
    const midMove = fireTouch("touchmove", twoFinger({ x: 100, y: 100 }, { x: 100, y: 200 }));
    expect(midMove.defaultPrevented).toBe(true);
    const newStart = fireTouch("touchstart", [touch(3, 50, 50, view.contentDOM)]);
    expect(newStart.defaultPrevented).toBe(true);
    // All fingers up → idle, lock released.
    fireTouch("touchend", [], []);
    expect(handle.ownsTouchGesture).toBe(false);
    expect(scroller.style.overflow).toBe("");
    expect(commits).toEqual([]);
    // A fresh single-finger sequence is independent: not prevented, and
    // its click isn't swallowed by stale suppression.
    const freshStart = fireTouch("touchstart", [touch(4, 60, 60, view.contentDOM)]);
    expect(freshStart.defaultPrevented).toBe(false);
    fireTouch("touchend", [], [touch(4, 60, 60, view.contentDOM)]);
    const click = new Event("click", { bubbles: true, cancelable: true });
    scroller.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it("the first lift keeps the scroll lock until the second finger drains", async () => {
    setup();
    startPinch();
    moveTo(160);
    await flushFrames();
    const remaining = touch(2, 100, 230, view.contentDOM);
    fireTouch("touchend", [remaining], [touch(1, 100, 70, view.contentDOM)]);
    // Still draining: lock held, no write yet, no caret/scroll
    // reinterpretation — the residual finger stays inert.
    expect(commits.length).toBe(0);
    expect(scroller.style.overflow).toBe("hidden");
    const drained = fireTouch("touchmove", [touch(2, 100, 260, view.contentDOM)]);
    expect(drained.defaultPrevented).toBe(true);
    fireTouch("touchend", [], [remaining]);
    expect(commits.length).toBe(1); // one write, executed when drain ended
    expect(scroller.style.overflow).toBe("");
    expect(handle.ownsTouchGesture).toBe(false);
  });

  it("swallows the compat click once, then a fresh tap is free", async () => {
    setup();
    startPinch();
    moveTo(160);
    await flushFrames();
    fireTouch("touchend", [touch(2, 100, 230, view.contentDOM)], [touch(1, 100, 70, view.contentDOM)]);
    fireTouch("touchend", [], [touch(2, 100, 230, view.contentDOM)]);
    const phantom = new Event("click", { bubbles: true, cancelable: true });
    scroller.dispatchEvent(phantom);
    expect(phantom.defaultPrevented).toBe(true); // gesture tail swallowed
    // A brand-new tap is a different sequence — its click must survive.
    fireTouch("touchstart", [touch(5, 60, 60, view.contentDOM)]);
    fireTouch("touchend", [], [touch(5, 60, 60, view.contentDOM)]);
    const real = new Event("click", { bubbles: true, cancelable: true });
    scroller.dispatchEvent(real);
    expect(real.defaultPrevented).toBe(false);
  });

  it("a real mouse pointerdown clears pending click suppression", async () => {
    setup();
    startPinch();
    moveTo(160);
    await flushFrames();
    fireTouch("touchend", [], twoFinger({ x: 100, y: 70 }, { x: 100, y: 230 }));
    const mouseDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(mouseDown, "pointerType", { value: "mouse" });
    scroller.dispatchEvent(mouseDown);
    const real = new Event("click", { bubbles: true, cancelable: true });
    scroller.dispatchEvent(real);
    expect(real.defaultPrevented).toBe(false);
  });

  it("a cancelled RAF scheduled before cancel does not preview afterwards", async () => {
    setup();
    startPinch();
    moveTo(200);
    handle.cancel(); // before the frame runs
    await flushFrames();
    expect(previews).toEqual([]);
    expect(commits).toEqual([]);
  });

  it("destroy removes listeners and restores touch-action", () => {
    setup();
    const prior = scroller.style.touchAction;
    handle.destroy();
    expect(scroller.style.touchAction).toBe(prior === "pan-x pan-y" ? "" : prior);
    // Listeners gone: a fresh two-finger start does nothing.
    const start = fireTouch("touchstart", twoFinger({ x: 100, y: 100 }, { x: 100, y: 200 }));
    expect(start.defaultPrevented).toBe(false);
  });

  it("destroy cancels a live preview and releases the scroll lock", async () => {
    setup();
    startPinch();
    moveTo(200);
    await flushFrames();
    expect(scroller.style.overflow).toBe("hidden");
    handle.destroy();
    expect(cancels).toBe(1);
    expect(scroller.style.overflow).toBe("");
    expect(commits).toEqual([]);
  });
});

/** Reconstruct the two original touches for an end/cancel event. */
function startPinchTouches(): FakeTouch[] {
  return [
    touch(1, 100, 100, view.contentDOM),
    touch(2, 100, 200, view.contentDOM)
  ];
}
