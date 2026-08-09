// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// Keeps the settings save off Tauri IPC; the journal's own reads go through the
// workspace bridge, not these commands.
vi.mock("../../native/commands", () => ({
  invokeNativeCommand: vi.fn<() => Promise<unknown>>()
}));

import { activateJournal, journalManifest } from "./journal";
import { createDesktopExtensionHost } from "../desktopExtensionHost";
import { createDesktopTabRegistry } from "../../tabs/tabRegistry";
import { desktopCommandRegistry } from "../../commands/commandRegistry";
import { desktopPanelRegistry } from "../../panels/panelRegistry";
import { appSettingsRegistry, useSettingsStore } from "../../settings/settingsStore";

let host: ReturnType<typeof createDesktopExtensionHost> | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  await host?.dispose();
  host = null;
  useSettingsStore.setState({
    appValues: {},
    workspaceValues: null,
    workspaceRootPath: null,
    stagedChanges: {},
    isDirty: false,
    dirtyCount: 0
  });
});

const activate = async () => {
  const tabs = createDesktopTabRegistry([]);
  host = createDesktopExtensionHost({ tabs });
  host.register({ id: journalManifest.id, trusted: true, activate: activateJournal });
  await host.activate(journalManifest.id);
  return tabs;
};

const VIEW_KEY = "extension-journal-calendar.calendarDefaultView";

/** Renders the contributed calendar tab the way the shell's TabContent does. */
const mount = async (tabs: ReturnType<typeof createDesktopTabRegistry>): Promise<HTMLDivElement> => {
  const factory = tabs.get("journal-calendar.calendar")?.factory;
  if (!factory) throw new Error("The calendar tab registered without a factory.");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(factory({ rootPath: "/vault", tabId: "calendar-1" }));
  });
  return container;
};

describe("journal built-in", () => {
  it("declares the ids D47 fixed", () => {
    expect(journalManifest.id).toBe("journal-calendar");
    expect(journalManifest.contributes?.panels?.[0]?.id).toBe("journal");
    expect(journalManifest.contributes?.commands?.map((command) => command.id)).toEqual([
      "new-entry",
      "today",
      "open-calendar"
    ]);
  });

  it("activates lazily, on its view or any of its commands (D65)", () => {
    expect(journalManifest.activationEvents).toEqual([
      "onView:journal",
      "onCommand:new-entry",
      "onCommand:today",
      "onCommand:open-calendar"
    ]);
  });

  it("registers the popout on the left, under a prefixed id", async () => {
    await activate();

    const panel = desktopPanelRegistry.get("journal-calendar.journal");
    expect(panel?.side).toBe("left");
    expect(panel?.label).toBe("Journal");
  });

  it("contributes no panel header actions, because D71 moved them into the panel", async () => {
    await activate();

    expect(desktopPanelRegistry.get("journal-calendar.journal")?.actions).toBeUndefined();
  });

  it("registers all three commands", async () => {
    await activate();

    for (const id of ["new-entry", "today", "open-calendar"]) {
      expect(desktopCommandRegistry.get(`journal-calendar.${id}`)).toBeDefined();
    }
  });

  it("registers the journal's settings module", async () => {
    await activate();

    expect(appSettingsRegistry.getModule("extension-journal-calendar")).toBeDefined();
    expect(appSettingsRegistry.getDefinition("extension-journal-calendar.root")?.scope).toBe(
      "workspace"
    );
  });

  it("registers the calendar as an available tab kind with a renderer", async () => {
    const tabs = await activate();

    const calendar = tabs.get("journal-calendar.calendar");
    expect(calendar?.isAvailable).toBe(true);
    expect(typeof calendar?.factory).toBe("function");
  });

  it("opens the calendar in the view this workspace last used (D79/D80)", async () => {
    const tabs = await activate();
    useSettingsStore.getState().stageChange(VIEW_KEY, "week");

    const host = await mount(tabs);

    expect(host.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("aria-label"))
      .toBe("Week");
  });

  it("persists the view the strip switches to", async () => {
    const tabs = await activate();
    // Workspace-scoped (D80), so the write needs a workspace to land in.
    useSettingsStore.setState({ workspaceRootPath: "/vault", workspaceValues: {} });
    const host = await mount(tabs);

    const week = host.querySelector<HTMLButtonElement>('button[aria-label="Week"]');
    await act(async () => week?.click());

    expect(useSettingsStore.getState().getEffectiveValue(VIEW_KEY)).toBe("week");
  });

  it("hands everything back when it deactivates", async () => {
    await activate();
    await host?.deactivate(journalManifest.id);

    expect(desktopPanelRegistry.get("journal-calendar.journal")).toBeUndefined();
    expect(desktopCommandRegistry.get("journal-calendar.today")).toBeUndefined();
    expect(appSettingsRegistry.getModule("extension-journal-calendar")).toBeUndefined();
  });
});
