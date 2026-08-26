// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNarrowViewport } from "./useNarrowViewport";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let listeners: Array<() => void> = [];

/** Installs a matchMedia stub whose match result can be flipped mid-test. */
const stubMatchMedia = (matches: boolean): { set: (next: boolean) => void } => {
  let current = matches;
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return current;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.push(listener),
    removeEventListener: (_: string, listener: () => void) => {
      listeners = listeners.filter((entry) => entry !== listener);
    }
  }));
  return {
    set: (next: boolean) => {
      current = next;
      for (const listener of listeners) listener();
    }
  };
};

beforeEach(() => {
  listeners = [];
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = null;
  container = null;
});

describe("useNarrowViewport", () => {
  it("reports the current match and follows changes", async () => {
    const media = stubMatchMedia(false);
    const seen: boolean[] = [];
    const Probe = (): null => {
      seen.push(useNarrowViewport());
      return null;
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Probe />));

    expect(seen.at(-1)).toBe(false);

    await act(async () => media.set(true));

    expect(seen.at(-1)).toBe(true);
  });
});
