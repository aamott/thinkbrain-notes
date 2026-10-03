// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TabBoundary } from "./TabBoundary";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const Boom = (): never => {
  throw new Error("boom");
};

// React logs every caught error to the console; the noise is expected here.
vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (children: React.ReactNode): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(children));
  return container;
};

describe("TabBoundary", () => {
  it("shows its own failure state instead of letting a crash empty the shell", async () => {
    const host = await render(
      <TabBoundary>
        <Boom />
      </TabBoundary>
    );

    expect(host.textContent).toContain("This tab stopped working");
    expect(host.textContent).toContain("untouched");
  });

  it("renders children normally until one throws", async () => {
    const host = await render(
      <TabBoundary>
        <p>fine</p>
      </TabBoundary>
    );

    expect(host.textContent).toContain("fine");
    expect(host.textContent).not.toContain("stopped working");
  });

  // The shell keys the boundary by tab id, so the next tab gets a fresh one —
  // a crash is answered per tab, not remembered for the session.
  it("recovers when a fresh boundary mounts for the next tab", async () => {
    const host = await render(
      <TabBoundary key="crashed-tab">
        <Boom />
      </TabBoundary>
    );
    expect(host.textContent).toContain("stopped working");

    await act(async () =>
      root?.render(
        <TabBoundary key="next-tab">
          <p>fine again</p>
        </TabBoundary>
      )
    );

    expect(host.textContent).toContain("fine again");
    expect(host.textContent).not.toContain("stopped working");
  });
});
