// @vitest-environment happy-dom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEditorDisplayController } from "./editorDisplayController";
import type { PinchAnchor } from "./editorPinchZoom";

/**
 * `requestMeasure` is queued instead of letting CodeMirror schedule frames,
 * so a test can run callbacks manually and interleave them with the state
 * changes (pref change, doc replacement, unmount) that must invalidate them.
 */
interface QueuedMeasure {
  read?: (view: EditorView) => unknown;
  write?: (result: unknown, view: EditorView) => void;
}
const queue: QueuedMeasure[] = [];
const runAll = (): void => {
  // CodeMirror also queues its own measures — those may omit callbacks.
  while (queue.length > 0) {
    const m = queue.shift()!;
    m.write?.(m.read?.(view), view);
  }
};

let host: HTMLElement;
let view: EditorView;
const ANCHOR: PinchAnchor = {
  pos: 5,
  offsetX: 0,
  offsetY: -4,
  startX: 100,
  startY: 150,
  x: 100,
  y: 150
};

const setup = (): ReturnType<typeof createEditorDisplayController> => {
  host = document.createElement("div");
  document.body.appendChild(host);
  const ctl = createEditorDisplayController({ fontSize: 16, lineWrapping: true });
  view = new EditorView({
    parent: host,
    state: EditorState.create({ doc: "line\n".repeat(200), extensions: ctl.extension() })
  });
  view.requestMeasure = (req?: Parameters<EditorView["requestMeasure"]>[0]) => {
    if (req !== undefined) queue.push(req as unknown as QueuedMeasure);
    return Promise.resolve(true);
  };
  return ctl;
};

afterEach(() => {
  queue.length = 0;
  view?.destroy();
  host?.remove();
  document.body.innerHTML = "";
});

describe("createEditorDisplayController", () => {
  it("commit clears the transform, applies the size, and queues an anchored measure", () => {
    const ctl = setup();
    view.dom.style.transform = "scale(1.5)";
    view.scrollDOM.scrollTop = 0;
    ctl.commit(view, 26, { ...ANCHOR });
    expect(view.dom.style.transform).toBe("");
    expect(ctl.applied().fontSize).toBe(26);
    expect(queue.length).toBeGreaterThan(0);
    expect(() => runAll()).not.toThrow();
  });

  it("a cancelled measure can never scroll after the fact", () => {
    const ctl = setup();
    ctl.commit(view, 26, { ...ANCHOR });
    // An external preference cancels the pending commit measure.
    ctl.cancelPreview(view);
    const top = view.scrollDOM.scrollTop;
    runAll();
    expect(view.scrollDOM.scrollTop).toBe(top);
  });

  it("a doc replacement invalidates the pending commit measure", () => {
    const ctl = setup();
    ctl.commit(view, 26, { ...ANCHOR });
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "short" } });
    const top = view.scrollDOM.scrollTop;
    expect(() => runAll()).not.toThrow();
    expect(view.scrollDOM.scrollTop).toBe(top);
  });

  it("applyPreferences bumps the generation before touching layout", () => {
    const ctl = setup();
    ctl.commit(view, 26, { ...ANCHOR });
    ctl.applyPreferences(view, { fontSize: 20, lineWrapping: false });
    const top = view.scrollDOM.scrollTop;
    runAll(); // the queued commit write must no-op against generation
    expect(view.scrollDOM.scrollTop).toBe(top);
    expect(ctl.applied()).toEqual({ fontSize: 20, lineWrapping: false });
  });

  it("renders a gap-held anchor via scrollIntoView, not estimate scrolls", async () => {
    const ctl = setup();
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const real = view.coordsAtPos;
    // The pos sits in a render gap — no coordinates until CM draws it.
    view.coordsAtPos = () => null;
    const top = view.scrollDOM.scrollTop;
    ctl.commit(view, 26, { ...ANCHOR });
    runAll();
    await Promise.resolve(); // flush the deferred scrollIntoView dispatches
    expect(scrollIntoView).toHaveBeenCalledWith(ANCHOR.pos, { y: "nearest" });
    view.coordsAtPos = real;
    expect(view.scrollDOM.scrollTop).toBe(top);
  });

  it("a dead view never receives a queued write", () => {
    const ctl = setup();
    ctl.commit(view, 26, { ...ANCHOR });
    view.dom.remove(); // detached without destroy — isConnected false
    expect(() => runAll()).not.toThrow();
    document.body.appendChild(host); // restore for afterEach cleanup
  });

  it("preview and cancelPreview manage the transform only", () => {
    const ctl = setup();
    ctl.preview(view, 24, { ...ANCHOR });
    expect(view.dom.style.transform).toContain("scale(1.5)");
    expect(view.contentDOM.style.transform).toBe("");
    ctl.cancelPreview(view);
    expect(view.dom.style.transform).toBe("");
    expect(view.dom.style.transformOrigin).toBe("");
  });
});
