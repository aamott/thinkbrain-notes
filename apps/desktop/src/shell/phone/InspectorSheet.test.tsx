// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectorSheet } from "./InspectorSheet";

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

const sheet = (overrides: Record<string, unknown> = {}): React.ReactElement => (
  <InspectorSheet
    open
    panel="outline"
    rootPath={null}
    documentContents={null}
    documentPath={null}
    onOpenNote={() => undefined}
    onDismiss={() => undefined}
    onBack={() => undefined}
    {...overrides}
  />
);

const drawer = (host: HTMLDivElement): Element | null =>
  host.querySelector('[role="dialog"][aria-label="Inspector"]')
  ?? host.querySelector('[aria-label="Inspector"]');

describe("InspectorSheet (right-edge drawer)", () => {
  it("anchors to the right edge, bounded below the header", async () => {
    const host = await render(sheet());
    const el = drawer(host);

    expect(el).not.toBeNull();
    const cls = el?.className ?? "";
    expect(cls).toContain("right-0");
    expect(cls).toContain("top-[calc(3.5rem+env(safe-area-inset-top))]");
    expect(cls).toContain("w-[90%]");
    expect(cls).toContain("max-w-96");
    expect(cls).toContain("translate-x-0");
  });

  // The hub must stay reachable while an inspector is open — a drawer (or
  // scrim) that ran to the screen bottom would cover it.
  it("does not cover the bottom hub", async () => {
    const host = await render(sheet());
    const cls = drawer(host)?.className ?? "";

    expect(cls).toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom))]");

    const scrimCls = host.querySelector("[data-tn-scrim]")?.className ?? "";
    expect(scrimCls).toContain("top-[calc(3.5rem+env(safe-area-inset-top))]");
    expect(scrimCls).toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom))]");
    // Horizontal bounds are explicit so `inset-0` cannot lose them when the
    // top/bottom bounds merge over it.
    expect(scrimCls).toContain("inset-x-0");
  });

  it("slides in from the right when open and out when closed", async () => {
    const openHost = await render(sheet());
    expect(drawer(openHost)?.className).toContain("translate-x-0");
    expect(drawer(openHost)?.getAttribute("aria-hidden")).toBe("false");
    await act(async () => root?.unmount());

    const closedHost = await render(sheet({ open: false }));
    const cls = drawer(closedHost)?.className ?? "";
    expect(cls).toContain("translate-x-full");
    expect(drawer(closedHost)?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the selected inspector's body", async () => {
    const host = await render(sheet({ panel: "outline", documentContents: "# Heading one" }));

    expect(host.querySelector('[aria-label="Outline panel"]')?.textContent).toContain(
      "Heading one"
    );
  });

  it("calls onBack from the panel header's Back control", async () => {
    const onBack = vi.fn();
    const onDismiss = vi.fn();
    const host = await render(sheet({ onBack, onDismiss }));

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Back from Outline"]')?.click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls onDismiss on a scrim tap", async () => {
    const onDismiss = vi.fn();
    const host = await render(sheet({ onDismiss }));

    const scrim = host.querySelector("[data-tn-scrim]");
    expect(scrim).not.toBeNull();
    await act(async () => {
      scrim?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
