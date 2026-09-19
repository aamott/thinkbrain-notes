// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhoneBreadcrumb } from "./PhoneBreadcrumb";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (segments: readonly string[] = ["Vault", "docs", "note"]) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<PhoneBreadcrumb segments={segments} />);
  });
  return container;
};

const pill = (): HTMLButtonElement =>
  container!.querySelector<HTMLButtonElement>('[aria-label="Current location"]')!;
const dialog = (): HTMLElement | null => container!.querySelector<HTMLElement>('[role="dialog"]');

describe("PhoneBreadcrumb", () => {
  it("renders every segment with the current one emphasized", async () => {
    await render();

    const text = pill().textContent ?? "";
    expect(text).toContain("Vault");
    expect(text).toContain("docs");
    expect(text).toContain("note");
    const current = [...pill().querySelectorAll("span")].find((s) => s.textContent === "note");
    expect(current?.className).toContain("font-semibold");
    expect(current?.className).toContain("text-foreground");
  });

  it("opens the full-path bubble on tap", async () => {
    await render();
    await act(async () => pill().click());

    expect(pill().getAttribute("aria-expanded")).toBe("true");
    expect(dialog()?.getAttribute("aria-label")).toBe("Full path");
    const row = dialog()!.querySelector<HTMLElement>('[tabindex="0"]')!;
    expect(row.textContent).toContain("Vault");
    expect(row.textContent).toContain("docs");
    expect(row.textContent).toContain("note");
  });

  it("closes on Escape and returns focus to the pill", async () => {
    await render();
    pill().focus();
    await act(async () => pill().click());
    expect(dialog()).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(pill());
  });

  it("closes when the undimmed outside layer is tapped", async () => {
    await render();
    await act(async () => pill().click());
    const layer = container!.querySelector(".fixed.inset-0")!;

    await act(async () => {
      layer.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(dialog()).toBeNull();
  });

  it("scrolls the bubble path to the current (rightmost) segment on open", async () => {
    const scrollWidth = vi
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(500);
    await render();

    await act(async () => pill().click());

    const row = dialog()!.querySelector<HTMLElement>('[tabindex="0"]')!;
    expect(row.scrollLeft).toBe(500);
    scrollWidth.mockRestore();
  });

  it("fades clipped ancestors only when the pill overflows", async () => {
    // Force the deterministic window-resize fallback path.
    vi.stubGlobal("ResizeObserver", undefined);
    await render();
    const fade = () => pill().querySelector(".bg-gradient-to-r");
    expect(fade()).toBeNull();

    const row = pill().querySelector<HTMLElement>(".w-max")!;
    const viewport = pill().querySelector<HTMLElement>(".overflow-hidden")!;
    Object.defineProperty(row, "offsetWidth", { configurable: true, value: 400 });
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 120 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(fade()).not.toBeNull();
    vi.unstubAllGlobals();
  });
});
