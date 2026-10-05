// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FloatingBubbles, type FloatingBubbleItem } from "./floating-bubbles";

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

const item = (overrides: Partial<FloatingBubbleItem> = {}): FloatingBubbleItem => ({
  key: "home",
  label: "Home",
  icon: <span>icon</span>,
  onSelect: () => undefined,
  ...overrides
});

const bubbles = (props: Partial<Parameters<typeof FloatingBubbles>[0]> = {}) => (
  <FloatingBubbles
    label="Quick actions"
    left={[]}
    right={[]}
    showLabels={false}
    {...props}
  />
);

describe("FloatingBubbles", () => {
  it("renders both groups inside one labelled group", async () => {
    const host = await render(
      bubbles({ left: [item()], right: [item({ key: "actions", label: "Actions" })] })
    );

    const toolbar = host.querySelector('[role="group"][aria-label="Quick actions"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.querySelector('[aria-label="Home"]')).not.toBeNull();
    expect(toolbar?.querySelector('[aria-label="Actions"]')).not.toBeNull();
  });

  it("hides label text unless showLabels is set", async () => {
    const host = await render(bubbles({ left: [item()] }));
    const bubble = host.querySelector<HTMLButtonElement>('[aria-label="Home"]');

    expect(bubble?.textContent).not.toContain("Home");

    await act(async () => root?.render(bubbles({ left: [item()], showLabels: true })));
    const labelled = host.querySelector<HTMLButtonElement>('[aria-label="Home"]');
    expect(labelled?.textContent).toContain("Home");
    expect(labelled?.className).toContain("px-4");
  });

  it("keeps the right group at the right edge when the left group is empty", async () => {
    const host = await render(
      bubbles({ right: [item({ key: "actions", label: "Actions" })] })
    );

    const toolbar = host.querySelector('[role="group"][aria-label="Quick actions"]');
    expect(toolbar?.className).toContain("justify-between");
    // Both groups always render, so justify-between pins ⋮ right even with
    // an empty left group.
    const groups = toolbar?.querySelectorAll(":scope > div");
    expect(groups).toHaveLength(2);
    expect(groups?.[0]?.querySelector("button")).toBeNull();
    expect(groups?.[1]?.querySelector('[aria-label="Actions"]')).not.toBeNull();
  });

  it("shows a badge count and announces it in the accessible name", async () => {
    const host = await render(bubbles({ left: [item({ badge: 3, badgeLabel: "conflicts" })] }));
    const bubble = host.querySelector<HTMLButtonElement>('[aria-label="Home, 3 conflicts"]');
    const badge = bubble?.querySelector(".bg-danger");

    expect(badge?.textContent).toBe("3");
    expect(badge?.getAttribute("aria-hidden")).toBe("true");
  });

  it("fires onSelect", async () => {
    const onSelect = vi.fn();
    const host = await render(bubbles({ left: [item({ onSelect })] }));

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Home"]')?.click();
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("marks popup triggers with aria-haspopup and aria-expanded", async () => {
    const host = await render(
      bubbles({ right: [item({ key: "actions", label: "Actions", hasPopup: true, active: true })] })
    );

    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Actions"]');
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    // Non-popup bubbles carry neither attribute.
    const host2 = await render(bubbles({ left: [item()] }));
    const plain = host2.querySelector<HTMLButtonElement>('[aria-label="Home"]');
    expect(plain?.getAttribute("aria-haspopup")).toBeNull();
    expect(plain?.getAttribute("aria-expanded")).toBeNull();
  });
});
