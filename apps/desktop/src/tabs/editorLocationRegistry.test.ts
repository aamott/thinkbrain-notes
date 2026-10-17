// @vitest-environment happy-dom

import { ChangeSet, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureEditorLocation,
  editorLinePosition,
  isEditorAtLine,
  notifyEditorMapped,
  notifyEditorVisibility,
  registerEditorView,
  restoreEditorLocation,
  subscribeEditorMapping,
  subscribeEditorViews,
  unregisterEditorView
} from "./editorLocationRegistry";

const mounted: EditorView[] = [];
const registered: { key: string; view: EditorView }[] = [];

const mount = (doc: string): EditorView => {
  const host = document.createElement("div");
  document.body.append(host);
  const view = new EditorView({ parent: host, state: EditorState.create({ doc }) });
  mounted.push(view);
  return view;
};

/** Registers and remembers the pairing so teardown can drop it first. */
const register = (key: string, view: EditorView): void => {
  registerEditorView(key, view);
  registered.push({ key, view });
};

afterEach(() => {
  // A destroyed view left in the registry would leak into the next test.
  for (const { key, view } of registered.splice(0)) unregisterEditorView(key, view);
  for (const view of mounted.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("view registration", () => {
  it("captures nothing and refuses to restore without a live view", () => {
    expect(captureEditorLocation("missing")).toBeUndefined();
    expect(restoreEditorLocation("missing", { anchor: 0, head: 0 })).toBe(false);
    expect(editorLinePosition("missing", 1)).toBeUndefined();
  });

  it("notifies subscribers as views come and go, stopping stale unmounts", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeEditorViews(() => seen.push("tick"));

    const view = mount("doc");
    register("tab", view);
    const replacement = mount("doc");
    register("tab", replacement);
    // The older view's cleanup runs later — it must not evict the remount,
    // and being a no-op it announces nothing.
    unregisterEditorView("tab", view);
    expect(captureEditorLocation("tab")).not.toBeUndefined();
    unregisterEditorView("tab", replacement);
    expect(captureEditorLocation("tab")).toBeUndefined();
    expect(seen).toHaveLength(3);

    unsubscribe();
    register("tab", view);
    expect(seen).toHaveLength(3);
    unregisterEditorView("tab", view);
  });
});

describe("captureEditorLocation / restoreEditorLocation", () => {
  it("round-trips the primary selection", () => {
    const view = mount("alpha\nbeta\ngamma");
    register("tab", view);
    view.dispatch({ selection: { anchor: 8, head: 10 } });

    const location = captureEditorLocation("tab")!;

    expect(location.anchor).toBe(8);
    expect(location.head).toBe(10);
    expect(location.scrollSnapshot).toBeDefined();

    view.dispatch({ selection: { anchor: 0 } });
    expect(restoreEditorLocation("tab", location)).toBe(true);
    expect(view.state.selection.main.anchor).toBe(8);
    expect(view.state.selection.main.head).toBe(10);
  });

  it("clamps a stored position into a shorter replacement document", () => {
    const view = mount("short");
    register("tab", view);

    restoreEditorLocation("tab", { anchor: 40, head: 60, scrollPos: 50 });

    expect(view.state.selection.main.anchor).toBe(5);
    expect(view.state.selection.main.head).toBe(5);
  });

  it("focuses the editor only when asked", () => {
    const view = mount("doc");
    register("tab", view);
    const focus = vi.spyOn(view, "focus");

    restoreEditorLocation("tab", { anchor: 0, head: 0 });
    expect(focus).not.toHaveBeenCalled();
    restoreEditorLocation("tab", { anchor: 0, head: 0 }, { focus: true });
    expect(focus).toHaveBeenCalledOnce();
  });
});

describe("editorLinePosition", () => {
  it("returns the document offset a 1-based line starts at", () => {
    const view = mount("alpha\nbeta\ngamma");
    register("tab", view);

    expect(editorLinePosition("tab", 1)).toBe(0);
    expect(editorLinePosition("tab", 2)).toBe(6);
    expect(editorLinePosition("tab", 3)).toBe(11);
  });

  it("clamps past the last line and below the first", () => {
    const view = mount("alpha\nbeta");
    register("tab", view);

    expect(editorLinePosition("tab", 99)).toBe(6);
    expect(editorLinePosition("tab", 0)).toBe(0);
    expect(editorLinePosition("tab", -3)).toBe(0);
  });
});

describe("isEditorAtLine", () => {
  /** A `DOMRect`-shaped value good enough for the comparisons this makes. */
  const rect = (top: number, bottom: number): DOMRect =>
    ({ top, bottom, left: 0, right: 800, x: 0, y: top, width: 800, height: bottom - top }) as DOMRect;

  /** Parks the scroller at faked metrics — happy-dom lays nothing out on its own. */
  const fakeScroller = (
    view: EditorView,
    bounds: DOMRect,
    metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }
  ): void => {
    vi.spyOn(view.scrollDOM, "getBoundingClientRect").mockReturnValue(bounds);
    Object.defineProperties(view.scrollDOM, {
      // CM's measure pass writes scrollTop — let it; the test owns the read.
      scrollTop: { configurable: true, get: () => metrics.scrollTop, set: () => undefined },
      clientHeight: { configurable: true, get: () => metrics.clientHeight },
      scrollHeight: { configurable: true, get: () => metrics.scrollHeight }
    });
  };

  it("is true when the caret sits at the line start with the viewport holding it at top", () => {
    const view = mount("alpha\nbeta\ngamma");
    register("tab", view);
    view.dispatch({ selection: { anchor: 6 } }); // line 2's start
    // The target measures at the scroller's top edge — the shape a
    // `scrollIntoView`-to-top landing leaves behind.
    vi.spyOn(view, "coordsAtPos").mockReturnValue({ left: 0, right: 8, top: 5, bottom: 23 });
    fakeScroller(view, rect(0, 600), { scrollTop: 0, clientHeight: 600, scrollHeight: 1000 });

    expect(isEditorAtLine("tab", 2)).toBe(true);
    expect(isEditorAtLine("missing", 2)).toBe(false);
  });

  it("is true for a landed tail target while the scroller is clamped at the bottom", () => {
    const view = mount("alpha\nbeta\ngamma");
    register("tab", view);
    view.dispatch({ selection: { anchor: 11 } }); // last line's start
    // A tail jump cannot put its target at the viewport top — the scroller
    // clamps at the bottom, leaving the heading inside the viewport.
    vi.spyOn(view, "coordsAtPos").mockReturnValue({ left: 0, right: 8, top: 500, bottom: 518 });
    fakeScroller(view, rect(0, 600), { scrollTop: 400, clientHeight: 600, scrollHeight: 1000 });

    expect(isEditorAtLine("tab", 3)).toBe(true);
  });

  it("is false when the caret is at the target but the user scrolled it mid-viewport", () => {
    const view = mount("alpha\nbeta\ngamma");
    register("tab", view);
    view.dispatch({ selection: { anchor: 6 } });
    // Same inside-the-viewport target, but the scroller is not at its bottom
    // — a scroll position, not a landed jump. This click must record.
    vi.spyOn(view, "coordsAtPos").mockReturnValue({ left: 0, right: 8, top: 300, bottom: 318 });
    fakeScroller(view, rect(0, 600), { scrollTop: 0, clientHeight: 600, scrollHeight: 1000 });

    expect(isEditorAtLine("tab", 2)).toBe(false);
  });

  it("is false for a caret elsewhere on the line or a non-collapsed selection", () => {
    const view = mount("alpha\nbeta\ngamma");
    register("tab", view);

    view.dispatch({ selection: { anchor: 8 } }); // inside line 2, not its start
    expect(isEditorAtLine("tab", 2)).toBe(false);
    view.dispatch({ selection: { anchor: 6, head: 9 } });
    expect(isEditorAtLine("tab", 2)).toBe(false);
  });
});

describe("hidden surfaces", () => {
  it("refuses capture and restore while an ancestor marks the surface hidden", () => {
    const view = mount("alpha\nbeta\ngamma");
    register("tab", view);
    view.dispatch({ selection: { anchor: 8 } });
    const focus = vi.spyOn(view, "focus");

    // The app marks a covered surface rather than unmounting the editor —
    // its scroller reads a zeroed viewport, which must not be captured as
    // the departure nor receive a restore (or its focus grab).
    view.dom.parentElement!.setAttribute("aria-hidden", "true");
    expect(captureEditorLocation("tab")).toBeUndefined();
    expect(restoreEditorLocation("tab", { anchor: 0, head: 0 }, { focus: true })).toBe(false);
    expect(view.state.selection.main.anchor).toBe(8);
    expect(focus).not.toHaveBeenCalled();
    expect(isEditorAtLine("tab", 1)).toBe(false);

    view.dom.parentElement!.removeAttribute("aria-hidden");
    expect(captureEditorLocation("tab")).toMatchObject({ anchor: 8, head: 8 });
  });

  it("honours the hidden attribute the same way", () => {
    const view = mount("doc");
    register("tab", view);
    view.dom.parentElement!.setAttribute("hidden", "");
    expect(captureEditorLocation("tab")).toBeUndefined();
    expect(restoreEditorLocation("tab", { anchor: 0, head: 0 })).toBe(false);
  });

  it("announces a re-shown surface only while its view is registered", () => {
    const ticks: string[] = [];
    const unsubscribe = subscribeEditorViews(() => ticks.push("tick"));

    // Nothing registered — a covered surface whose editor unmounted has
    // nothing to announce.
    notifyEditorVisibility("tab");
    const view = mount("doc");
    register("tab", view); // ordinary view-set tick
    notifyEditorVisibility("tab"); // the re-show announcement
    notifyEditorVisibility("other");
    expect(ticks).toHaveLength(2);

    unsubscribe();
  });
});

describe("subscribeEditorMapping", () => {
  it("forwards notified changes until unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEditorMapping(listener);
    // Any ChangeDesc will do — the registry forwards it untouched.
    const changes = ChangeSet.of({ from: 0, insert: "x" }, 3);

    notifyEditorMapped("tab", changes);
    expect(listener).toHaveBeenCalledWith("tab", changes);

    unsubscribe();
    notifyEditorMapped("tab", changes);
    expect(listener).toHaveBeenCalledOnce();
  });
});
