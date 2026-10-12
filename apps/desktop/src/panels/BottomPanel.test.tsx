// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomPanel } from "./BottomPanel";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderBottomPanel(onClose: () => void = () => undefined) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<BottomPanel active="terminal" onClose={onClose} />);
  });
}

describe("BottomPanel", () => {
  it("renders the terminal tab and its honest unavailable state", async () => {
    await renderBottomPanel();

    expect(container?.querySelector(`#bottom-panel-tab-terminal`)?.getAttribute("aria-selected")).toBe("true");
    expect(container?.textContent).toContain("Terminal unavailable. Native terminal execution requires ACP capability work.");
  });

  it("calls onClose from the strip's close button", async () => {
    const onClose = vi.fn();
    await renderBottomPanel(onClose);

    const close = container?.querySelector<HTMLButtonElement>('[aria-label="Close bottom panel"]');
    await act(async () => {
      close?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render removed problems, output, or backlinks tabs", async () => {
    await renderBottomPanel();

    expect(container?.querySelector(`#bottom-panel-tab-problems`)).toBeNull();
    expect(container?.querySelector(`#bottom-panel-tab-output`)).toBeNull();
    expect(container?.querySelector(`#bottom-panel-tab-backlinks`)).toBeNull();
  });
});
