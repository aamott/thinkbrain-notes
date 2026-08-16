// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useCoarsePointer } from "./useCoarsePointer";

/**
 * D76: touch decides, not width.
 *
 * A full-screen popout on a phone and a wide desktop panel can be the same
 * number of pixels across, so a width query cannot tell a fingertip from a
 * mouse. Only the pointer can.
 */

interface FakeQuery {
  matches: boolean;
  readonly listeners: Set<() => void>;
  emit(next: boolean): void;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const original = window.matchMedia;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  window.matchMedia = original;
});

const install = (matches: boolean): FakeQuery => {
  const query: FakeQuery = {
    matches,
    listeners: new Set(),
    emit(next) {
      query.matches = next;
      for (const listener of query.listeners) listener();
    }
  };
  window.matchMedia = ((text: string) => {
    if (text !== "(pointer: coarse)") throw new Error(`Unexpected query: ${text}`);
    return {
      get matches() {
        return query.matches;
      },
      addEventListener: (_event: string, listener: () => void) => query.listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => query.listeners.delete(listener)
    };
  }) as unknown as typeof window.matchMedia;
  return query;
};

const render = async (): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const Probe = () => createElement("span", null, useCoarsePointer() ? "touch" : "pointer");
  await act(async () => root?.render(createElement(Probe)));
  return container;
};

describe("useCoarsePointer", () => {
  it("reports touch when the primary pointer is coarse", async () => {
    install(true);

    expect((await render()).textContent).toBe("touch");
  });

  it("reports a fine pointer otherwise", async () => {
    install(false);

    expect((await render()).textContent).toBe("pointer");
  });

  // A tablet with a keyboard folded on and off changes this mid-session.
  it("follows the pointer changing under a mounted component", async () => {
    const query = install(false);
    const host = await render();

    await act(async () => query.emit(true));

    expect(host.textContent).toBe("touch");
  });

  it("assumes a fine pointer where the query is unavailable", async () => {
    // @ts-expect-error — deliberately removing the API the way an old runtime would.
    window.matchMedia = undefined;

    expect((await render()).textContent).toBe("pointer");
  });
});
