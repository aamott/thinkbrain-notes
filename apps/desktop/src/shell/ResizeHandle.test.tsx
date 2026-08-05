// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "./ResizeHandle";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderResizeHandle() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onPointerDown = vi.fn();
  const onPointerCancel = vi.fn();
  const onDoubleClick = vi.fn();
  const onKeyDown = vi.fn();

  await act(async () => {
    root?.render(
      <ResizeHandle
        label="Resize left panel"
        onPointerDown={onPointerDown}
        onPointerCancel={onPointerCancel}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      />
    );
  });

  return {
    handle: container.querySelector<HTMLButtonElement>("button")!,
    onPointerDown,
    onPointerCancel,
    onDoubleClick,
    onKeyDown
  };
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("ResizeHandle", () => {
  it("delegates reset and cancellation events without removing keyboard focus", async () => {
    const { handle, onDoubleClick, onPointerCancel } = await renderResizeHandle();

    await act(async () => {
      handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      handle.dispatchEvent(new Event("pointercancel", { bubbles: true }));
    });

    expect(onDoubleClick).toHaveBeenCalledOnce();
    expect(onPointerCancel).toHaveBeenCalledOnce();
    expect(handle.tabIndex).toBe(0);
    expect(handle.className).toContain("select-none");
  });

  it("delegates keyboard events to the shell resize behavior", async () => {
    const { handle, onKeyDown } = await renderResizeHandle();

    await act(async () => {
      handle.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowRight",
        shiftKey: true
      }));
    });

    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});
