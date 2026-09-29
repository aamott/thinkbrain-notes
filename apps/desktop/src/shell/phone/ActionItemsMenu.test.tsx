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
    documentPath={null}
    documentDirty={false}
    onOpenNote={() => undefined}
    onCompareVersion={() => undefined}
    onRestoreVersion={async () => undefined}
    onDismiss={() => undefined}
    onSelect={() => undefined}
    {...overrides}
  />
);

const menuOf = (host: HTMLDivElement): Element | null =>
  host.querySelector('[role="menu"][aria-label="Action items"]');

describe("ActionItemsMenu", () => {
  it("offers Version history once, disabled without a file open", async () => {
    const onSelect = vi.fn();
    const host = await render(menu({ onSelect }));
    const rows = menuOf(host)?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Version history"]'
    );

    // It is an ordinary right-panel contribution — one row, greyed until a
    // file is the visible content, never a bespoke extra entry.
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.disabled).toBe(true);
    expect(menuOf(host)?.querySelector('[aria-label="Saved versions"]')).toBeNull();
    await act(async () => rows?.[0]?.click());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens Version history for the file on screen", async () => {
    const onSelect = vi.fn();
    const host = await render(menu({ onSelect, documentPath: "note.md" }));
    const row = menuOf(host)?.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Version history"]'
    );

    expect(row?.disabled).toBe(false);
    await act(async () => row?.click());
    expect(onSelect).toHaveBeenCalledWith("history");
  });

  it("shows optional Back/Forward rows that disable and fire independently", async () => {
    const onBack = vi.fn();
    const onForward = vi.fn();
    const host = await render(
      menu({
        historyControls: { canGoBack: true, canGoForward: false, onBack, onForward }
      })
    );
    const back = menuOf(host)?.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Back"]'
    );
    const forward = menuOf(host)?.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Forward"]'
    );

    expect(back?.disabled).toBe(false);
    expect(forward?.disabled).toBe(true);
    await act(async () => back?.click());
    expect(onBack).toHaveBeenCalledOnce();
    expect(onForward).not.toHaveBeenCalled();
  });

  it("omits history rows when historyControls is not supplied", async () => {
    const host = await render(menu());

    expect(
      menuOf(host)?.querySelector('[role="menuitem"][aria-label="Back"]')
    ).toBeNull();
    expect(
      menuOf(host)?.querySelector('[role="menuitem"][aria-label="Forward"]')
    ).toBeNull();
  });

  it("lists every registered right-panel contribution as a menuitem", async () => {
    const host = await render(menu());
    const el = menuOf(host);

    expect(el).not.toBeNull();
    for (const label of ["Version history", "Outline", "Properties", "Backlinks", "Assistant"]) {
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

  // Roving focus shared by both phone menus: arrows move between enabled
  // rows (wrapping at the ends), Home/End jump, and a disabled row is never
  // a stop.
  const row = (host: HTMLDivElement, label: string): HTMLButtonElement | null =>
    menuOf(host)?.querySelector<HTMLButtonElement>(
      `[role="menuitem"][aria-label="${label}"]`
    ) ?? null;
  const press = (host: HTMLDivElement, key: string) =>
    menuOf(host)?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

  it("moves focus with ArrowDown/ArrowUp, wrapping at the ends", async () => {
    const host = await render(menu({ documentPath: "note.md" }));
    // With a file open every right-panel row is enabled, in registry order.
    const order = ["Version history", "Outline", "Backlinks", "Properties", "Assistant"] as const;
    // Start with focus outside the menu: Down then selects the first row.
    await act(async () => (document.activeElement as HTMLElement | null)?.blur());

    await act(async () => press(host, "ArrowDown"));
    expect(document.activeElement).toBe(row(host, order[0]));
    for (const label of order.slice(1)) {
      await act(async () => press(host, "ArrowDown"));
      expect(document.activeElement).toBe(row(host, label));
    }
    await act(async () => press(host, "ArrowDown"));
    expect(document.activeElement).toBe(row(host, order[0]));
    await act(async () => press(host, "ArrowUp"));
    expect(document.activeElement).toBe(row(host, "Assistant"));
  });

  it("jumps to the first/last row with Home/End", async () => {
    const host = await render(menu({ documentPath: "note.md" }));
    await act(async () => (document.activeElement as HTMLElement | null)?.blur());

    await act(async () => press(host, "End"));
    expect(document.activeElement).toBe(row(host, "Assistant"));
    await act(async () => press(host, "Home"));
    expect(document.activeElement).toBe(row(host, "Version history"));
  });
});
