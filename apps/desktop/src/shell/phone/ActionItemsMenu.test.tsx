// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionItemsMenu } from "./ActionItemsMenu";

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

const menu = (overrides: Record<string, unknown> = {}): React.ReactElement => (
  <ActionItemsMenu
    open
    rootPath={null}
    documentContents={null}
    onDismiss={() => undefined}
    onSelect={() => undefined}
    {...overrides}
  />
);

const menuOf = (host: HTMLDivElement): Element | null =>
  host.querySelector('[role="menu"][aria-label="Action items"]');

describe("ActionItemsMenu", () => {
  it("lists every registered right-panel contribution as a menuitem", async () => {
    const host = await render(menu());
    const el = menuOf(host);

    expect(el).not.toBeNull();
    for (const label of ["Outline", "Properties", "Backlinks", "Assistant"]) {
      expect(el?.querySelector(`[role="menuitem"][aria-label="${label}"]`)).not.toBeNull();
    }
  });

  // Backlinks declares `availability: () => false` in the registry — the row
  // stays visible but disabled rather than vanishing or pretending to work.
  it("keeps unavailable entries visible but disabled", async () => {
    const host = await render(menu());
    const backlinks = menuOf(host)?.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Backlinks"]'
    );

    expect(backlinks).not.toBeNull();
    expect(backlinks?.disabled).toBe(true);
  });

  it("calls onSelect with the chosen panel", async () => {
    const onSelect = vi.fn();
    const host = await render(menu({ onSelect }));

    await act(async () => {
      menuOf(host)
        ?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Outline"]')
        ?.click();
    });

    expect(onSelect).toHaveBeenCalledWith("outline");
  });

  it("dismisses on an outside tap", async () => {
    const onDismiss = vi.fn();
    const host = await render(menu({ onDismiss }));

    // The bounded layer wraps the menu — a direct hit on it (outside the
    // menu surface) dismisses, while taps on the menu itself do not.
    const layer = menuOf(host)?.parentElement;
    expect(layer).not.toBeNull();
    await act(async () => {
      layer?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape", async () => {
    const onDismiss = vi.fn();
    await render(menu({ onDismiss }));

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // The *layer* spans header→hub so outside taps anywhere dismiss, but the
  // menu itself is compact: auto height at the top-right, capped by the layer.
  it("keeps the menu compact inside a layer bounded between header and hub", async () => {
    const host = await render(menu());
    const menuEl = menuOf(host);
    const menuCls = menuEl?.className ?? "";
    const layerCls = menuEl?.parentElement?.className ?? "";

    expect(menuCls).toContain("top-0");
    expect(menuCls).toContain("right-2");
    expect(menuCls).toContain("max-h-full");
    expect(menuCls).not.toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom))]");
    expect(layerCls).toContain("top-[calc(3.5rem+env(safe-area-inset-top))]");
    expect(layerCls).toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom))]");
  });
});
