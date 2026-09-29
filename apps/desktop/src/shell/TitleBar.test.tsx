// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { desktopPanelRegistry } from "../panels/panelRegistryModel";
import { TitleBar } from "./TitleBar";
import type { RightPanel } from "./shellTypes";
import { createVersionDiffTab, type DesktopTab } from "../tabs/tabModel";

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

  it("keeps a restore tab's visible title short while tooltip and names carry the version", async () => {
    // Two restores of one file: identical visible titles, distinguishable
    // accessible names via the version's date.
    const earlier = createVersionDiffTab(
      { rootPath: "/vault", relativePath: "notes/hello.md" },
      "chg-1",
      Date.UTC(2026, 7, 18, 12, 0, 0)
    );
    const later = createVersionDiffTab(
      { rootPath: "/vault", relativePath: "notes/hello.md" },
      "chg-2",
      Date.UTC(2026, 7, 19, 12, 0, 0)
    );
    const host = await render({ tabs: [earlier, later] });

    const chips = [...host.querySelectorAll(`[data-tab-id]`)];
    expect(chips).toHaveLength(2);
    const names = chips.map((chip) => {
      const activate = chip.querySelector<HTMLButtonElement>("[aria-current], button");
      return {
        text: chip.textContent,
        label: activate?.getAttribute("aria-label"),
        title: activate?.getAttribute("title"),
        close: chip.querySelector<HTMLButtonElement>("button:last-child")?.getAttribute("aria-label")
      };
    });
    for (const name of names) {
      expect(name.text).toContain("Restore: hello.md");
      expect(name.label).toContain("Restore: hello.md");
      expect(name.label).toContain("version from");
      expect(name.title).toBe(name.label);
      expect(name.close).toBe(`Close ${name.label}`);
    }
    // The version date is what tells them apart — and it must actually differ.
    expect(names[0]!.label).not.toBe(names[1]!.label);
    expect(names[0]!.label).toContain("2026");
  });

  // An ordinary dirty tab has no explicit aria-label: the "Unsaved changes"
  // descendant is part of its accessible name, and an explicit label would
  // silently drop that status.
  it("leaves an ordinary dirty tab's accessible name to its contents", async () => {
    const host = await render({
      tabs: [{ id: "settings", title: "Settings", kind: "settings", isDirty: true }]
    });

    const activate = host.querySelector<HTMLButtonElement>("[data-tab-id] > button");
    expect(activate?.getAttribute("aria-label")).toBeNull();
    expect(activate?.getAttribute("title")).toBe("Settings");
    expect(activate?.querySelector('[aria-label="Unsaved changes"]')).not.toBeNull();
    expect(host.textContent).not.toContain("version from");
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
