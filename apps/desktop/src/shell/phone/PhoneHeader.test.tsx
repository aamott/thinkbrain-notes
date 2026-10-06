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
  mainMenuOpen: false,
  onBack: () => {},
  onForward: () => {},
  onOpenTabs: () => {},
  onToggleMainMenu: () => {}
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
  it("keeps Back visible but hides Forward at the history boundaries", async () => {
    await render();

    expect(button("Back")?.disabled).toBe(true);
    expect(button("Forward")).toBeNull();
    expect(container?.querySelector('[aria-label="Open navigation"]')).toBeNull();
  });

  it("enables Back independently and renders Forward only when available", async () => {
    await render({ canGoBack: true, canGoForward: false });
    expect(button("Back")?.disabled).toBe(false);
    expect(button("Forward")).toBeNull();

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

  it("gives the main-menu trigger pressed and open feedback", async () => {
    await render();
    const trigger = button("Main menu");

    expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(trigger?.className.split(" ")).toEqual(
      expect.arrayContaining(["active:bg-accent", "aria-expanded:bg-accent"])
    );

    await act(async () => {
      root?.render(
        <PhoneHeader
          {...base}
          canGoBack={false}
          canGoForward={false}
          mainMenuOpen
        />
      );
    });
    expect(button("Main menu")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows the badge count on the menu button only above zero", async () => {
    await render({ badge: 2 });
    expect(button("Main menu, 2 conflicts")?.textContent).toContain("2");

    await act(async () => {
      root?.render(
        <PhoneHeader {...base} canGoBack={false} canGoForward={false} badge={0} />
      );
    });
    expect(button("Main menu")?.textContent).not.toContain("0");
  });

  it("announces the conflict count in the menu button's accessible name", async () => {
    await render({ badge: 3 });
    expect(button("Main menu, 3 conflicts")).not.toBeNull();
    // The visible chip stays aria-hidden — the count is only in the name.
    const chip = button("Main menu, 3 conflicts")?.querySelector("span:last-child");
    expect(chip?.getAttribute("aria-hidden")).toBe("true");
    expect(chip?.textContent).toBe("3");
  });

  it("feeds the location pill its breadcrumb segments", async () => {
    await render({ breadcrumbs: ["Vault", "docs", "note"] });

    const pill = container!.querySelector('[aria-label="Current location"]');
    expect(pill?.textContent).toContain("Vault");
    expect(pill?.textContent).toContain("docs");
    expect(pill?.textContent).toContain("note");
  });
});
