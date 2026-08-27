// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardInset } from "./useKeyboardInset";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = null;
  container = null;
});

const renderInset = async (): Promise<() => number> => {
  let latest = 0;
  const Probe = (): null => {
    latest = useKeyboardInset();
    return null;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
  return () => latest;
};

/**
 * A stub whose height is read live on every access.
 *
 * A snapshot taken at construction would report the same number before and
 * after the keyboard opens, so the test could not fail against a hook that
 * never subscribed at all.
 */
const stubViewport = (state: { height: number }) => {
  // Kept as (type, listener) pairs rather than a Set: the hook registers the
  // *same* callback for "resize" and "scroll", and a Set would collapse the
  // two and hide a half-finished teardown.
  let bound: readonly (readonly [string, () => void])[] = [];
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("visualViewport", {
    get height() {
      return state.height;
    },
    offsetTop: 0,
    addEventListener: (type: string, listener: () => void) => {
      bound = [...bound, [type, listener]];
    },
    removeEventListener: (type: string, listener: () => void) => {
      bound = bound.filter(([boundType, bound]) => boundType !== type || bound !== listener);
    }
  });
  return {
    fire: async () => act(async () => bound.forEach(([, listener]) => listener())),
    types: () => bound.map(([type]) => type)
  };
};

describe("useKeyboardInset", () => {
  it("is zero when the platform has no visualViewport", async () => {
    vi.stubGlobal("visualViewport", undefined);

    const inset = await renderInset();

    expect(inset()).toBe(0);
  });

  it("reports the space the keyboard takes below the visual viewport", async () => {
    const state = { height: 800 };
    const viewport = stubViewport(state);

    const inset = await renderInset();
    expect(inset()).toBe(0);

    // The keyboard opens *after* mount, which is the only way the hook's
    // subscription is under test rather than its first read.
    state.height = 500;
    await viewport.fire();

    expect(inset()).toBe(300);
  });

  it("never reports a negative inset when the visual viewport is taller", async () => {
    const state = { height: 900 };
    stubViewport(state);

    const inset = await renderInset();

    expect(inset()).toBe(0);
  });

  it("unsubscribes on unmount", async () => {
    const viewport = stubViewport({ height: 800 });
    await renderInset();
    expect(viewport.types()).toEqual(["resize", "scroll"]);

    await act(async () => root?.unmount());
    root = null;

    expect(viewport.types()).toEqual([]);
  });
});
