// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { desktopPanelRegistry } from "../panels/panelRegistryModel";
import { TitleBar } from "./TitleBar";
import type { RightPanel } from "./shellTypes";
import type { DesktopTab } from "../tabs/tabModel";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const render = async (props: {
  readonly rightPanel?: "outline" | null;
  readonly tabs?: readonly DesktopTab[];
  readonly onToggleRightPanel?: (panel: RightPanel) => void;
} = {}): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <TitleBar
        tabs={props.tabs ?? []}
        activeTabId={null}
        rightPanel={props.rightPanel ?? null}
        showWorkspaceSelector={false}
        onSelectTab={() => undefined}
        onRequestCloseTab={() => undefined}
        onToggleRightPanel={props.onToggleRightPanel ?? (() => undefined)}
        onOpenCommandPalette={() => undefined}
      />
    )
  );
  return container;
};

const rightActions = () => desktopPanelRegistry.entriesBySide("right");

const trigger = (host: HTMLElement): HTMLButtonElement => {
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Action items"]');
  if (!button) throw new Error("Action items trigger missing");
  return button;
};

const menu = (host: HTMLElement): HTMLElement | null =>
  host.querySelector('#desktop-action-items-menu[role="menu"]');

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("TitleBar", () => {
  it("renders every right-panel action as a labelled button plus the kebab trigger", async () => {
    const host = await render();

    for (const action of rightActions()) {
      expect(host.querySelector(`[aria-label="${action.label}"]`)).not.toBeNull();
    }
    const kebab = trigger(host);
    expect(kebab.getAttribute("aria-expanded")).toBe("false");
    expect(kebab.getAttribute("aria-controls")).toBe("desktop-action-items-menu");
    expect(kebab.getAttribute("title")).toBe("Action items");
    // CSS, not JS, decides which control shows: the kebab only appears at
    // narrow widths, the button row only at wide ones.
    expect(kebab.className).toContain("max-[900px]:inline-flex");
    expect(host.querySelector(".max-\\[900px\\]\\:hidden")).not.toBeNull();
  });

  it("opens a menu listing every right contribution in registry order", async () => {
    const host = await render();

    await act(async () => trigger(host).click());

    const opened = menu(host);
    expect(opened).not.toBeNull();
    expect(trigger(host).getAttribute("aria-expanded")).toBe("true");
    const items = [...opened!.querySelectorAll('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual(
      rightActions().map((action) => action.label)
    );
  });

  it("marks the open panel as current inside the menu", async () => {
    const host = await render({ rightPanel: "outline" });

    await act(async () => trigger(host).click());

    const current = menu(host)!.querySelector("[aria-current='true']");
    expect(current?.textContent).toBe("Outline");
  });

  it("selecting a menu row toggles the panel and closes the menu", async () => {
    const onToggleRightPanel = vi.fn();
    const host = await render({ onToggleRightPanel });

    await act(async () => trigger(host).click());
    const outline = [...menu(host)!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent === "Outline");
    await act(async () => outline!.click());

    expect(onToggleRightPanel).toHaveBeenCalledWith("outline");
    expect(menu(host)).toBeNull();
    expect(trigger(host).getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const host = await render();

    await act(async () => trigger(host).click());
    expect(menu(host)).not.toBeNull();

    await act(async () => {
      menu(host)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(menu(host)).toBeNull();
    expect(document.activeElement).toBe(trigger(host));
  });

  it("closes on an outside pointer without stealing focus", async () => {
    const host = await render();

    await act(async () => trigger(host).click());
    expect(menu(host)).not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(menu(host)).toBeNull();
    // The click owns where focus went; the trigger is not grabbed back.
    expect(document.activeElement).not.toBe(trigger(host));
  });

  it("closes the menu when the window widens past the breakpoint", async () => {
    // Controlled matchMedia so the test can flip the breakpoint itself.
    let wideListener: ((event: { matches: boolean }) => void) | null = null;
    const query = {
      matches: false,
      media: "(min-width: 901px)",
      onchange: null,
      addEventListener: (_: string, cb: (event: { matches: boolean }) => void) => { wideListener = cb; },
      removeEventListener: (_: string, cb: (event: { matches: boolean }) => void) => {
        if (wideListener === cb) wideListener = null;
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    };
    vi.stubGlobal("matchMedia", vi.fn(() => query));

    const host = await render();
    await act(async () => trigger(host).click());
    expect(menu(host)).not.toBeNull();

    await act(async () => wideListener?.({ matches: true }));

    expect(menu(host)).toBeNull();
  });
});
