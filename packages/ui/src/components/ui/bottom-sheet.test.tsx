// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomSheet } from "./bottom-sheet";

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

describe("BottomSheet", () => {
  it("renders nothing while closed", async () => {
    const host = await render(
      <BottomSheet open={false} onDismiss={() => undefined} label="Open tabs">
        <p>content</p>
      </BottomSheet>
    );

    expect(host.querySelector('[aria-label="Open tabs"]')).toBeNull();
  });

  it("exposes its content as a labelled dialog when open", async () => {
    const host = await render(
      <BottomSheet open onDismiss={() => undefined} label="Open tabs">
        <p>content</p>
      </BottomSheet>
    );

    const panel = host.querySelector('[aria-label="Open tabs"]');
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.textContent).toContain("content");
  });

  it("dismisses on Escape", async () => {
    const onDismiss = vi.fn();
    await render(
      <BottomSheet open onDismiss={onDismiss} label="Open tabs">
        <button type="button">close me</button>
      </BottomSheet>
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
