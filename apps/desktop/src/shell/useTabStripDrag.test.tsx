// @vitest-environment happy-dom
import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStaticTab } from "../tabs/tabModel";
import { crossedTabDragThreshold, tabDragTarget, tabEdgeScroll, useTabStripDrag } from "./useTabStripDrag";

const slots = [
  { id: "a", left: 0, width: 100 },
  { id: "b", left: 102, width: 100 },
  { id: "c", left: 204, width: 100 }
];

describe("tab drag geometry", () => {
  it("keeps presses below 6px as clicks", () => {
    expect(crossedTabDragThreshold(5, 0)).toBe(false);
    expect(crossedTabDragThreshold(3, 4)).toBe(false);
    expect(crossedTabDragThreshold(-6, 0)).toBe(true);
    expect(crossedTabDragThreshold(0, 6)).toBe(true);
  });

  it("crosses other tab midpoints, excluding the source slot", () => {
    expect(tabDragTarget(slots, "b", 152)).toBe(1);
    expect(tabDragTarget(slots, "a", 151)).toBe(0);
    expect(tabDragTarget(slots, "a", 153)).toBe(1);
    expect(tabDragTarget(slots, "a", 255)).toBe(2);
    expect(tabDragTarget(slots, "c", -100)).toBe(0);
    expect(tabDragTarget(slots, "a", 1000)).toBe(2);
  });

  it("scrolls only near edges and bounds its speed", () => {
    expect(tabEdgeScroll(150, 0, 300)).toBe(0);
    expect(tabEdgeScroll(0, 0, 300)).toBe(-12);
    expect(tabEdgeScroll(400, 0, 300)).toBe(12);
    expect(tabEdgeScroll(282, 0, 300)).toBe(6);
  });
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const tabs = slots.map((slot) => ({ ...createStaticTab("settings", slot.id), id: slot.id }));
const reorder = vi.fn();
let suppressClick = () => false;

function Probe() {
  const ref = useRef<HTMLElement>(null);
  const drag = useTabStripDrag(ref, tabs, reorder);
  useEffect(() => { suppressClick = drag.suppressClick; });
  return <nav ref={ref}>{tabs.map((tab, index) =>
    <button key={tab.id} data-tab-id={tab.id} style={drag.tabStyle(index)}
      onPointerDown={(event) => drag.onPointerDown(event, tab.id)} />
  )}</nav>;
}

async function mount() {
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Probe />));
  const buttons = Array.from(host.querySelectorAll("button"));
  buttons.forEach((button, index) => {
    const slot = slots[index]!;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
      { left: slot.left, width: slot.width } as DOMRect
    );
  });
  return buttons[0]!;
}

async function pointer(target: EventTarget, type: string, x: number, pointerType = "mouse") {
  await act(async () => {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType, button: 0, clientX: x
    }));
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  vi.restoreAllMocks();
  reorder.mockClear();
});

describe("tab drag session", () => {
  it("does not commit or suppress a click below threshold", async () => {
    const button = await mount();
    await pointer(button, "pointerdown", 50);
    await pointer(window, "pointermove", 55);
    await pointer(window, "pointerup", 55);
    expect(reorder).not.toHaveBeenCalled();
    expect(suppressClick()).toBe(false);
  });

  it("previews displacement then commits once and suppresses the trailing click", async () => {
    const button = await mount();
    await pointer(button, "pointerdown", 50);
    await pointer(window, "pointermove", 270);
    expect(button.style.transform).toBe("translateX(220px)");
    expect(host?.querySelectorAll("button")[1]?.style.transform).toBe("translateX(-100px)");
    expect(reorder).not.toHaveBeenCalled();
    await pointer(window, "pointerup", 270);
    expect(reorder).toHaveBeenCalledExactlyOnceWith(tabs[0]!.id, 2);
    expect(suppressClick()).toBe(true);
    expect(button.style.transform).toBe("");
    await pointer(window, "pointerup", 270);
    expect(reorder).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape and ignores touch", async () => {
    const button = await mount();
    await pointer(button, "pointerdown", 50, "touch");
    await pointer(window, "pointermove", 270, "touch");
    await pointer(window, "pointerup", 270, "touch");
    expect(reorder).not.toHaveBeenCalled();
    await pointer(button, "pointerdown", 50);
    await pointer(window, "pointermove", 270);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    await pointer(window, "pointerup", 270);
    expect(reorder).not.toHaveBeenCalled();
    expect(button.style.transform).toBe("");
  });

  it("accounts for edge scrolling while the pointer stays still", async () => {
    const button = await mount();
    const strip = host!.querySelector("nav")!;
    vi.spyOn(strip, "getBoundingClientRect").mockReturnValue({ left: 0, right: 200 } as DOMRect);
    await pointer(button, "pointerdown", 50);
    await pointer(window, "pointermove", 190);
    const tick = vi.mocked(window.requestAnimationFrame).mock.calls.at(-1)![0];
    await act(async () => tick(16));
    expect(strip.scrollLeft).toBeGreaterThan(0);
    expect(button.style.transform).not.toBe("translateX(140px)");
    await pointer(window, "pointerup", 190);
    expect(reorder).toHaveBeenCalledExactlyOnceWith(tabs[0]!.id, 1);
  });

  it("restores selection and removes listeners on unmount", async () => {
    document.body.style.userSelect = "text";
    const button = await mount();
    await pointer(button, "pointerdown", 50, "pen");
    await pointer(window, "pointermove", 270, "pen");
    expect(document.body.style.userSelect).toBe("none");
    await act(async () => root?.unmount());
    root = null;
    expect(document.body.style.userSelect).toBe("text");
    await pointer(window, "pointerup", 270, "pen");
    expect(reorder).not.toHaveBeenCalled();
    document.body.style.userSelect = "";
  });
});
