// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhoneHeader } from "./PhoneHeader";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const base = {
  breadcrumbs: ["Vault", "Files"],
  tabCount: 0,
  onBack: () => {},
  onForward: () => {},
  onOpenTabs: () => {},
  onOpenInspector: () => {}
};

const render = async (props: Partial<Parameters<typeof PhoneHeader>[0]> = {}) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<PhoneHeader {...base} canGoBack={false} canGoForward={false} {...props} />);
  });
  return container;
};

const button = (label: string): HTMLButtonElement | null =>
  container!.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

describe("PhoneHeader", () => {
  it("always renders Back and Forward — disabled at the stack boundary", async () => {
    await render();

    expect(button("Back")?.disabled).toBe(true);
    expect(button("Forward")?.disabled).toBe(true);
    expect(container?.querySelector('[aria-label="Open navigation"]')).toBeNull();
  });

  it("enables Back and Forward independently", async () => {
    await render({ canGoBack: true, canGoForward: false });
    expect(button("Back")?.disabled).toBe(false);
    expect(button("Forward")?.disabled).toBe(true);

    await act(async () => {
      root?.render(
        <PhoneHeader {...base} canGoBack={false} canGoForward={true} />
      );
    });
    expect(button("Back")?.disabled).toBe(true);
    expect(button("Forward")?.disabled).toBe(false);
  });

  it("fires onBack and onForward from their buttons", async () => {
    const onBack = vi.fn();
    const onForward = vi.fn();
    await render({ canGoBack: true, canGoForward: true, onBack, onForward });

    await act(async () => button("Back")?.click());
    await act(async () => button("Forward")?.click());

    expect(onBack).toHaveBeenCalledOnce();
    expect(onForward).toHaveBeenCalledOnce();
  });

  it("omits both history buttons under showHistoryControls={false} but keeps the pill", async () => {
    await render({ showHistoryControls: false });

    expect(button("Back")).toBeNull();
    expect(button("Forward")).toBeNull();
    expect(container?.querySelector('[aria-label="Current location"]')).not.toBeNull();
  });

  it("feeds the location pill its breadcrumb segments", async () => {
    await render({ breadcrumbs: ["Vault", "docs", "note"] });

    const pill = container!.querySelector('[aria-label="Current location"]');
    expect(pill?.textContent).toContain("Vault");
    expect(pill?.textContent).toContain("docs");
    expect(pill?.textContent).toContain("note");
  });
});
