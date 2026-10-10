// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useVisualViewportBox, type VisualViewportBox } from "./useVisualViewportBox";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = null;
  container = null;
});

const renderBox = async (): Promise<() => VisualViewportBox | null> => {
  let latest: VisualViewportBox | null = null;
  const Probe = (): null => {
    latest = useVisualViewportBox();
    return null;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
  return () => latest;
};

/**
 * A stub whose geometry is read live on every access — a snapshot would
 * report the same numbers before and after the keyboard opens, so the test
 * could not fail against a hook that never subscribed at all.
 */
const stubViewport = (state: { height: number; offsetTop: number; scale: number }) => {
  // (type, listener) pairs, not a Set: the hook registers the *same* callback
  // for "resize" and "scroll", and a Set would hide a half-finished teardown.
  let bound: readonly (readonly [string, () => void])[] = [];
  vi.stubGlobal("visualViewport", {
    get height() {
      return state.height;
    },
    get offsetTop() {
      return state.offsetTop;
    },
    get scale() {
      return state.scale;
    },
    addEventListener: (type: string, listener: () => void) => {
      bound = [...bound, [type, listener]];
    },
    removeEventListener: (type: string, listener: () => void) => {
      bound = bound.filter(([boundType, bound]) => boundType !== type || bound !== listener);
    }
  });
  return {
    fire: async (type?: string) =>
      act(async () =>
        bound.forEach(([boundType, listener]) => {
          if (type === undefined || boundType === type) listener();
        })
      ),
    types: () => bound.map(([boundType]) => boundType)
  };
};

describe("useVisualViewportBox", () => {
  it("is null when the platform has no visualViewport", async () => {
    vi.stubGlobal("visualViewport", undefined);

    const box = await renderBox();

    expect(box()).toBeNull();
  });

  it("reports the box and follows it as the keyboard resizes the viewport", async () => {
    const state = { height: 800, offsetTop: 0, scale: 1 };
    const viewport = stubViewport(state);

    const box = await renderBox();
    expect(box()).toEqual({ height: 800, offsetTop: 0 });

    // The keyboard opens *after* mount — the subscription, not the first
    // read, is what is under test.
    state.height = 500;
    await viewport.fire("resize");

    expect(box()).toEqual({ height: 500, offsetTop: 0 });
  });

  it("reports a panned viewport's offsetTop — the visual pan the shell must follow", async () => {
    // Without a layout resize the browser pans the visual viewport inside it:
    // height shrinks and offsetTop grows. The shell must track both or its
    // header ends up above the visible area.
    stubViewport({ height: 500, offsetTop: 120, scale: 1 });

    const box = await renderBox();

    expect(box()).toEqual({ height: 500, offsetTop: 120 });
  });

  it("is null while pinch-zoomed — the shell keeps its layout height", async () => {
    stubViewport({ height: 500, offsetTop: 0, scale: 2 });

    const box = await renderBox();

    expect(box()).toBeNull();
  });

  it("cancels a document pan by scrolling the window back to the origin", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    stubViewport({ height: 500, offsetTop: 0, scale: 1 });
    await renderBox();

    vi.stubGlobal("scrollY", 40);
    await act(async () => window.dispatchEvent(new Event("scroll")));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("does not fight a pan while pinch-zoomed", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    stubViewport({ height: 500, offsetTop: 0, scale: 2 });
    await renderBox();

    vi.stubGlobal("scrollY", 40);
    await act(async () => window.dispatchEvent(new Event("scroll")));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", async () => {
    const viewport = stubViewport({ height: 800, offsetTop: 0, scale: 1 });
    await renderBox();
    expect(viewport.types()).toEqual(["resize", "scroll"]);

    await act(async () => root?.unmount());
    root = null;

    expect(viewport.types()).toEqual([]);
  });
});
