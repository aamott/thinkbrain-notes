// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MarkdownFormatAction } from "../../tabs/markdownFormat";
import { FormattingBar } from "./FormattingBar";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (onFormat = vi.fn<(action: MarkdownFormatAction) => void>()) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<FormattingBar onFormat={onFormat} />));
  return onFormat;
};

describe("FormattingBar", () => {
  it("renders one button per formatting action in a named group", async () => {
    await render();
    const bar = container?.querySelector('[role="group"][aria-label="Formatting"]');
    expect(bar).not.toBeNull();
    for (const label of [
      "Bold",
      "Italic",
      "Strikethrough",
      "Code",
      "Heading",
      "Bullet list",
      "Numbered list",
      "Task list",
      "Quote",
      "Link"
    ]) {
      expect(bar?.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
    }
  });

  it("fires onFormat with the button's action on click", async () => {
    const onFormat = await render();
    const quote = container?.querySelector<HTMLButtonElement>('button[aria-label="Quote"]');
    const bullet = container?.querySelector<HTMLButtonElement>('button[aria-label="Bullet list"]');

    await act(async () => {
      quote?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      bullet?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onFormat).toHaveBeenCalledWith("quote");
    expect(onFormat).toHaveBeenCalledWith("bullet-list");
  });

  it("prevents default on pointerdown and mousedown so the editor keeps focus", async () => {
    await render();
    const button = container?.querySelector<HTMLButtonElement>('button[aria-label="Bold"]');

    const pointer = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    const mouse = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => {
      button?.dispatchEvent(pointer);
      button?.dispatchEvent(mouse);
    });

    expect(pointer.defaultPrevented).toBe(true);
    expect(mouse.defaultPrevented).toBe(true);
  });
});
