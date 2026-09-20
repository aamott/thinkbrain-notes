// @vitest-environment happy-dom
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewNoteMenu } from "./NewNoteMenu";

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
  <NewNoteMenu
    open
    anchorPercent={50}
    recentNote={{ title: "Shopping" }}
    onCreate={() => undefined}
    onOpenRecent={() => undefined}
    onDismiss={() => undefined}
    {...overrides}
  />
);

const menuOf = (host: HTMLDivElement): Element | null =>
  host.querySelector('[role="menu"][aria-label="New note actions"]');
const row = (host: HTMLDivElement, label: string): HTMLButtonElement | null =>
  menuOf(host)?.querySelector<HTMLButtonElement>(`[role="menuitem"][aria-label="${label}"]`) ??
  null;

describe("NewNoteMenu", () => {
  it("offers create and reopen rows", async () => {
    const host = await render(menu());

    expect(row(host, "Create new note")).not.toBeNull();
    expect(row(host, "Open most recent note")).not.toBeNull();
    // The recent note's title rides along as a muted secondary line.
    expect(row(host, "Open most recent note")?.textContent).toContain("Shopping");
  });

  it("disables the recent row when there is no note to reopen", async () => {
    const host = await render(menu({ recentNote: null }));

    expect(row(host, "Open most recent note")?.disabled).toBe(true);
    expect(row(host, "Create new note")?.disabled).toBe(false);
  });

  it("fires onCreate and onOpenRecent", async () => {
    const onCreate = vi.fn();
    const onOpenRecent = vi.fn();
    const host = await render(menu({ onCreate, onOpenRecent }));

    await act(async () => row(host, "Create new note")?.click());
    await act(async () => row(host, "Open most recent note")?.click());

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onOpenRecent).toHaveBeenCalledOnce();
  });

  it("dismisses on an outside tap", async () => {
    const onDismiss = vi.fn();
    const host = await render(menu({ onDismiss }));
    const layer = host.querySelector(".fixed.inset-x-0");

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

  it("bounds the outside layer between the header and the hub", async () => {
    const host = await render(menu());
    const layer = host.querySelector(".fixed.inset-x-0");

    expect(layer?.className).toContain("top-[calc(3.5rem+env(safe-area-inset-top))]");
    expect(layer?.className).toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom))]");
  });

  it("skips disabled rows in arrow navigation", async () => {
    const host = await render(menu({ recentNote: null }));
    const menuEl = menuOf(host)!;
    const press = (key: string) =>
      menuEl.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

    // Only one enabled row exists, so every arrow stays on it.
    await act(async () => press("ArrowDown"));
    expect(document.activeElement).toBe(row(host, "Create new note"));
    await act(async () => press("ArrowDown"));
    expect(document.activeElement).toBe(row(host, "Create new note"));
    await act(async () => press("ArrowUp"));
    expect(document.activeElement).toBe(row(host, "Create new note"));
  });

  it("wraps ArrowUp to the last enabled row", async () => {
    const host = await render(menu());
    const menuEl = menuOf(host)!;

    await act(async () => {
      menuEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(document.activeElement).toBe(row(host, "Open most recent note"));
  });

  it("anchors the popup to the hub slot's rendered position", async () => {
    const host = await render(menu({ anchorPercent: 30 }));
    const el = menuOf(host) as HTMLElement;

    // happy-dom's CSSOM drops clamp() values from `style`, so the inline
    // anchor is asserted on the serialized markup instead of the DOM node.
    const markup = renderToStaticMarkup(
      <NewNoteMenu
        open
        anchorPercent={30}
        recentNote={null}
        onCreate={() => undefined}
        onOpenRecent={() => undefined}
        onDismiss={() => undefined}
      />
    );
    expect(markup).toContain("clamp(7rem, 30%");
    expect(markup).toContain("calc(100% - 7rem)");
    expect(el.className).toContain("bottom-[calc(100%+0.5rem)]");
    expect(el.className).toContain("-translate-x-1/2");
    expect(el.className).toContain("w-56");
  });

  it("renders nothing while closed", async () => {
    const host = await render(menu({ open: false }));

    expect(menuOf(host)).toBeNull();
  });
});
