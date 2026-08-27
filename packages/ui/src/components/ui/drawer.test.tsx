// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Drawer } from "./drawer";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

describe("Drawer", () => {
  it("is hidden while closed", async () => {
    const host = await render(
      <Drawer open={false} onDismiss={() => undefined} label="Navigation">
        <button type="button">Files</button>
      </Drawer>
    );

    // Always mounted so it can slide in/out — closed means inert and
    // hidden from the a11y tree, not absent from the DOM.
    const panel = host.querySelector('[aria-label="Navigation"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
  });

  it("exposes its content as a labelled dialog when open", async () => {
    const host = await render(
      <Drawer open onDismiss={() => undefined} label="Navigation">
        <button type="button">Files</button>
      </Drawer>
    );

    const panel = host.querySelector('[aria-label="Navigation"]');
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    expect(panel?.textContent).toContain("Files");
  });

  it("dismisses when the scrim is tapped", async () => {
    const onDismiss = vi.fn();
    const host = await render(
      <Drawer open onDismiss={onDismiss} label="Navigation">
        <button type="button">Files</button>
      </Drawer>
    );

    const scrim = host.querySelector('[aria-hidden="true"]');
    await act(async () => {
      scrim?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
