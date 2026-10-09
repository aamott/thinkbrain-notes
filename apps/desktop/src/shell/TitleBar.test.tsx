// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { desktopPanelRegistry } from "../panels/panelRegistryModel";
import { resetNotificationStore, useNotificationStore } from "../notifications/notificationStore";
import { useSettingsStore } from "../settings/settingsStore";
import { DEFAULT_PINNED_ACTION_ITEMS } from "./actionItemsModel";
import { TitleBar } from "./TitleBar";
import type { RightPanel } from "./shellTypes";
import { createVersionDiffTab, type DesktopTab } from "../tabs/tabModel";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const render = async (props: {
  readonly rightPanel?: "outline" | null;
  readonly tabs?: readonly DesktopTab[];
  readonly canGoBack?: boolean;
  readonly canGoForward?: boolean;
  readonly onBack?: () => void;
  readonly onForward?: () => void;
  readonly onToggleRightPanel?: (panel: RightPanel) => void;
  readonly onKeepTab?: (tabId: string) => void;
  readonly onNewTab?: () => void;
  readonly isPanelAvailable?: (panelId: string) => boolean;
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
        canGoBack={props.canGoBack ?? false}
        canGoForward={props.canGoForward ?? false}
        onBack={props.onBack ?? (() => undefined)}
        onForward={props.onForward ?? (() => undefined)}
        onSelectTab={() => undefined}
        onRequestCloseTab={() => undefined}
        onKeepTab={props.onKeepTab ?? (() => undefined)}
        onNewTab={props.onNewTab ?? (() => undefined)}
        onToggleRightPanel={props.onToggleRightPanel ?? (() => undefined)}
        onOpenCommandPalette={() => undefined}
        isPanelAvailable={props.isPanelAvailable ?? (() => true)}
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

/**
 * Forces the 900px breakpoint the component reads through matchMedia.
 * `wide` = at/above 900px — icons visible, ⋯ lists only unpinned panels.
 */
const stubWidth = (wide: boolean) => {
  let listener: ((event: { matches: boolean }) => void) | null = null;
  const query = {
    matches: wide,
    media: "(min-width: 901px)",
    onchange: null,
    addEventListener: (_: string, cb: (event: { matches: boolean }) => void) => { listener = cb; },
    removeEventListener: (_: string, cb: (event: { matches: boolean }) => void) => {
      if (listener === cb) listener = null;
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false
  };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return {
    setWide: (nowWide: boolean) => {
      // A real MQL updates `.matches` before firing `change` — mirror that so
      // snapshot-based hooks re-read the new value.
      query.matches = nowWide;
      listener?.({ matches: nowWide });
    }
  };
};

// Captured before any test swaps it out — restored in afterEach.
const realSetSettingImmediately = useSettingsStore.getState().setSettingImmediately;

const pin = async (labels: readonly string[]) => {
  await act(async () => {
    useSettingsStore.getState().stageChange("ui.pinnedActionItems", JSON.stringify(labels));
  });
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetNotificationStore();
  useSettingsStore.setState({
    stagedChanges: {},
    setSettingImmediately: realSetSettingImmediately
  });
  vi.unstubAllGlobals();
});

describe("TitleBar", () => {
  it("renders the pinned panels as labelled buttons plus the kebab trigger", async () => {
    const host = await render();

    for (const action of rightActions()) {
      const button = host.querySelector(`[aria-label="${action.label}"]`);
      if (DEFAULT_PINNED_ACTION_ITEMS.includes(action.id)) {
        expect(button, action.id).not.toBeNull();
      } else {
        // Unpinned panels are ⋯-menu rows only — no stray icon in the bar.
        expect(button, action.id).toBeNull();
      }
    }
    const kebab = trigger(host);
    expect(kebab.getAttribute("aria-expanded")).toBe("false");
    expect(kebab.getAttribute("aria-controls")).toBe("desktop-action-items-menu");
    expect(kebab.getAttribute("title")).toBe("Action items");
    // Unpinned panels exist, so the ⋯ is visible at every width; the icon
    // row still collapses under 900px where the menu carries everything.
    expect(kebab.className).toContain("inline-flex");
    expect(host.querySelector(".max-\\[900px\\]\\:hidden")).not.toBeNull();
  });

  it("opens a narrow-width menu listing every right contribution, each with a pin toggle", async () => {
    stubWidth(false);
    const host = await render();

    await act(async () => trigger(host).click());

    const opened = menu(host);
    expect(opened).not.toBeNull();
    expect(trigger(host).getAttribute("aria-expanded")).toBe("true");
    // Two menuitems per row: the open button, then the pin toggle.
    const rows = [...opened!.querySelectorAll('[role="menuitem"]')]
      .filter((item) => !item.hasAttribute("aria-label"));
    expect(rows.map((item) => item.textContent)).toEqual(
      rightActions().map((action) => action.label)
    );
    for (const action of rightActions()) {
      const pinned = DEFAULT_PINNED_ACTION_ITEMS.includes(action.id);
      expect(opened!.querySelector(`[aria-label="${pinned ? "Unpin" : "Pin"} ${action.label}"]`)).not.toBeNull();
    }
  });

  it("lists only unpinned contributions in the wide-width menu", async () => {
    stubWidth(true);
    const host = await render();

    await act(async () => trigger(host).click());

    // The pin toggles carry an aria-label; the open buttons do not.
    const rows = [...menu(host)!.querySelectorAll('[role="menuitem"]')]
      .filter((item) => !item.hasAttribute("aria-label"));
    expect(rows.map((item) => item.textContent)).toEqual(
      rightActions()
        .filter((action) => !DEFAULT_PINNED_ACTION_ITEMS.includes(action.id))
        .map((action) => action.label)
    );
  });

  it("marks the open panel as current inside the menu", async () => {
    stubWidth(false);
    const host = await render({ rightPanel: "outline" });

    await act(async () => trigger(host).click());

    const current = menu(host)!.querySelector("[aria-current='true']");
    expect(current?.textContent).toBe("Outline");
  });

  it("selecting a menu row toggles the panel and closes the menu", async () => {
    stubWidth(false);
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

  /**
   * The shell gates the dock on `desktopPanelRegistry.isAvailable`; a menu row
   * that ignores the same answer selects a panel nothing renders — the menu
   * closes and the user sees nothing happen. Unavailable rows stay listed but
   * disabled, matching the phone's ActionItemsMenu.
   */
  it("keeps an unavailable panel's menu row visible but disabled", async () => {
    stubWidth(false);
    const onToggleRightPanel = vi.fn();
    const host = await render({
      onToggleRightPanel,
      isPanelAvailable: (id) => id !== "history"
    });

    await act(async () => trigger(host).click());
    const history = [...menu(host)!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent === "Version history");

    expect(history).not.toBeNull();
    expect(history!.disabled).toBe(true);
    await act(async () => history!.click());
    expect(onToggleRightPanel).not.toHaveBeenCalled();
    // A disabled row must not close the menu around it.
    expect(menu(host)).not.toBeNull();
  });

  it("dims an unavailable pinned panel's bar icon instead of offering a dead toggle", async () => {
    // Pin history so it gets a bar icon, then make it unavailable.
    await pin(["history"]);
    const host = await render({ isPanelAvailable: (id) => id !== "history" });

    const icon = host.querySelector('[role="button"][aria-label="Version history"]');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-disabled")).toBe("true");
    // Not a clickable IconButton: no <button> under that label.
    expect(host.querySelector('button[aria-label="Version history"]')).toBeNull();
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

  it("renders Back and Forward dimmed at the ends of the stack", async () => {
    const host = await render();

    for (const label of ["Back", "Forward"]) {
      const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      expect(button).not.toBeNull();
      expect(button?.disabled).toBe(true);
      expect(button?.className).toContain("disabled:opacity-40");
    }
  });

  it("enables Back and reports the click once history has a previous tab", async () => {
    const onBack = vi.fn();
    const host = await render({ canGoBack: true, onBack });

    const back = host.querySelector<HTMLButtonElement>('[aria-label="Back"]')!;
    expect(back.disabled).toBe(false);
    await act(async () => back.click());
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("enables Forward while a forward visit exists, and reports the click", async () => {
    const onForward = vi.fn();
    const host = await render({ canGoBack: true, canGoForward: true, onForward });

    const forward = host.querySelector<HTMLButtonElement>('[aria-label="Forward"]')!;
    expect(forward).not.toBeNull();
    await act(async () => forward.click());
    expect(onForward).toHaveBeenCalledOnce();
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
    const { setWide } = stubWidth(false);

    const host = await render();
    await act(async () => trigger(host).click());
    expect(menu(host)).not.toBeNull();

    await act(async () => setWide(true));

    expect(menu(host)).toBeNull();
  });

  it("keeps the ⋯ trigger only under 900px when nothing is unpinned", async () => {
    await pin(rightActions().map((action) => action.id));
    stubWidth(true);
    const host = await render();

    const kebab = host.querySelector<HTMLButtonElement>('[aria-label="Action items"]');
    expect(kebab?.className).toContain("hidden");
    expect(kebab?.className).toContain("max-[900px]:inline-flex");
    for (const action of rightActions()) {
      expect(host.querySelector(`[aria-label="${action.label}"]`)).not.toBeNull();
    }
  });

  it("pins a panel from its ⋯ row without closing the menu", async () => {
    stubWidth(true);
    const setSettingImmediately = vi.fn(async () => undefined);
    useSettingsStore.setState({ setSettingImmediately });
    const host = await render();

    await act(async () => trigger(host).click());
    const pinButton = menu(host)!.querySelector<HTMLButtonElement>('[aria-label="Pin Version history"]');
    expect(pinButton).not.toBeNull();
    await act(async () => pinButton!.click());

    expect(setSettingImmediately).toHaveBeenCalledWith(
      "ui.pinnedActionItems",
      expect.stringContaining('"history"')
    );
    // Toggles stay put so the user can pin several rows in one visit.
    expect(menu(host)).not.toBeNull();
  });

  it("right-clicking a bar icon opens a menu offering to unpin it", async () => {
    const host = await render();
    const outline = host.querySelector<HTMLButtonElement>('[aria-label="Outline"]');
    expect(outline).not.toBeNull();

    await act(async () => {
      outline!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 12, clientY: 8 }));
    });

    // Pointer menus portal to document.body — the query goes there.
    const pinMenu = [...document.querySelectorAll<HTMLElement>('[role="menu"]')]
      .find((element) => element.getAttribute("aria-label") === "Outline options");
    expect(pinMenu).not.toBeNull();
    const labels = [...pinMenu!.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
    expect(labels).toEqual(["Open Outline", "Unpin from title bar"]);
  });

  it("surfaces an unpinned panel's icon while a notification is waiting on it", async () => {
    const host = await render();
    // History is unpinned by default — no icon until its notification lands.
    expect(host.querySelector('[aria-label="Version history"]')).toBeNull();

    await act(async () => {
      useNotificationStore.getState().addNotification({
        source: "test",
        title: "Sync needs attention",
        message: "A round trip failed.",
        severity: "sticky",
        variant: "error",
        panel: "history"
      });
    });

    const icon = host.querySelector<HTMLButtonElement>('[aria-label="Version history (1)"]');
    expect(icon).not.toBeNull();
    // ...and still reachable from the ⋯ menu? No — it auto-showed, so it
    // moved out of the overflow list.
    await act(async () => trigger(host).click());
    const openRows = [...menu(host)!.querySelectorAll('[role="menuitem"]')]
      .filter((item) => !item.hasAttribute("aria-label"));
    expect(openRows.map((item) => item.textContent)).not.toContain("Version history");

    // Dismissing the entry pulls the icon back off the bar.
    await act(async () => {
      const item = useNotificationStore.getState().notifications[0];
      useNotificationStore.getState().dismissNotification(item!.id);
    });
    expect(host.querySelector('[aria-label="Version history (1)"]')).toBeNull();
  });

  it("opens a new tab from the strip's trailing + button", async () => {
    const onNewTab = vi.fn();
    const host = await render({ onNewTab });

    const button = host.querySelector<HTMLButtonElement>('nav [aria-label="New tab"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());

    expect(onNewTab).toHaveBeenCalledOnce();
  });

  it("marks a preview tab's title italic and promotes it on double-click", async () => {
    const onKeepTab = vi.fn();
    const host = await render({
      onKeepTab,
      tabs: [{ id: "t1", title: "draft.md", kind: "editor", preview: true }]
    });

    const title = host.querySelector("[data-tab-id='t1'] .italic");
    expect(title?.textContent).toContain("draft.md");

    const activate = host.querySelector<HTMLButtonElement>("[data-tab-id='t1'] > button");
    await act(async () => {
      activate!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(onKeepTab).toHaveBeenCalledWith("t1");
  });
});
