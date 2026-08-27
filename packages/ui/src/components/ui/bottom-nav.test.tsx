// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomNav, type BottomNavItem } from "./bottom-nav";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  vi.useRealTimers();
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

const item = (overrides: Partial<BottomNavItem> = {}): BottomNavItem => ({
  key: "files",
  label: "Files",
  icon: <span>icon</span>,
  onSelect: () => undefined,
  ...overrides
});

const button = (host: HTMLDivElement, label: string): HTMLButtonElement => {
  const found = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
};

/**
 * React synthesises `onPointerDown`/`onPointerUp`/`onPointerCancel` from
 * delegated native events, so a bubbling native dispatch is enough. Long-press
 * timing is faked, but only `setTimeout`/`clearTimeout` are — React's own
 * scheduler and `act` still need real task queues.
 */
const pointer = async (target: Element, type: string): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(new Event(type, { bubbles: true }));
  });
};

const useLongPressTimers = (): void => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
};

const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

describe("BottomNav", () => {
  it("renders a labelled button per item", async () => {
    const host = await render(
      <BottomNav label="Primary" items={[item(), item({ key: "search", label: "Search" })]} />
    );

    expect(host.querySelector('[aria-label="Files"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Search"]')).not.toBeNull();
  });

  it("shows the label as visible text, not only as an aria-label", async () => {
    const host = await render(<BottomNav label="Primary" items={[item()]} />);

    expect(host.textContent).toContain("Files");
  });

  it("marks the active item for assistive tech", async () => {
    const host = await render(<BottomNav label="Primary" items={[item({ active: true })]} />);

    expect(host.querySelector('[aria-label="Files"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("renders a badge count when one is supplied", async () => {
    const host = await render(
      <BottomNav label="Primary" items={[item({ key: "sync", label: "Sync", badge: 3 })]} />
    );

    expect(host.querySelector('[aria-label="Sync"]')?.textContent).toContain("3");
  });

  it("calls onSelect when tapped", async () => {
    const onSelect = vi.fn();
    const host = await render(<BottomNav label="Primary" items={[item({ onSelect })]} />);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Files"]')?.click();
    });

    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe("BottomNav long press", () => {
  it("fires onLongPress once the hold threshold passes", async () => {
    const onLongPress = vi.fn();
    const host = await render(<BottomNav label="Primary" items={[item({ onLongPress })]} />);
    useLongPressTimers();

    await pointer(button(host, "Files"), "pointerdown");
    expect(onLongPress).not.toHaveBeenCalled();

    await advance(500);

    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it("does not also call onSelect when the finger lifts after a long press", async () => {
    const onSelect = vi.fn();
    const onLongPress = vi.fn();
    const host = await render(
      <BottomNav label="Primary" items={[item({ onSelect, onLongPress })]} />
    );
    useLongPressTimers();

    const target = button(host, "Files");
    await pointer(target, "pointerdown");
    await advance(500);
    await pointer(target, "pointerup");
    await act(async () => target.click());

    expect(onLongPress).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("calls onSelect and not onLongPress for a press released early", async () => {
    const onSelect = vi.fn();
    const onLongPress = vi.fn();
    const host = await render(
      <BottomNav label="Primary" items={[item({ onSelect, onLongPress })]} />
    );
    useLongPressTimers();

    const target = button(host, "Files");
    await pointer(target, "pointerdown");
    await advance(200);
    await pointer(target, "pointerup");
    await act(async () => target.click());
    await advance(1000);

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("cancels a pending long press on pointer cancel", async () => {
    const onLongPress = vi.fn();
    const host = await render(<BottomNav label="Primary" items={[item({ onLongPress })]} />);
    useLongPressTimers();

    const target = button(host, "Files");
    await pointer(target, "pointerdown");
    await pointer(target, "pointercancel");
    await advance(1000);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("treats an item with no onLongPress as a plain button, however long the hold", async () => {
    const onSelect = vi.fn();
    const host = await render(<BottomNav label="Primary" items={[item({ onSelect })]} />);
    useLongPressTimers();

    const target = button(host, "Files");
    await pointer(target, "pointerdown");
    await advance(1000);
    await pointer(target, "pointerup");
    await act(async () => target.click());

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("does not swallow the next tap when a long press produced no click", async () => {
    const onSelect = vi.fn();
    const onLongPress = vi.fn();
    const host = await render(
      <BottomNav
        label="Primary"
        items={[
          item({ onLongPress }),
          item({ key: "search", label: "Search", onSelect })
        ]}
      />
    );
    useLongPressTimers();

    // Hold the first item past the threshold, then slide off so no click lands.
    await pointer(button(host, "Files"), "pointerdown");
    await advance(500);
    await pointer(button(host, "Files"), "pointercancel");

    // A fresh tap on a different item must still select.
    const next = button(host, "Search");
    await pointer(next, "pointerdown");
    await pointer(next, "pointerup");
    await act(async () => next.click());

    expect(onLongPress).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("clears a pending long press on unmount", async () => {
    const onLongPress = vi.fn();
    const host = await render(<BottomNav label="Primary" items={[item({ onLongPress })]} />);
    useLongPressTimers();

    await pointer(button(host, "Files"), "pointerdown");
    await act(async () => root?.unmount());
    root = null;
    await advance(1000);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
