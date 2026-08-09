// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { activateJournal, journalManifest } from "./journal";
import { createDesktopExtensionHost } from "../desktopExtensionHost";
import { createDesktopTabRegistry } from "../../tabs/tabRegistry";
import { desktopCommandRegistry } from "../../commands/commandRegistry";
import { desktopPanelRegistry } from "../../panels/panelRegistry";
import { appSettingsRegistry } from "../../settings/settingsStore";

let host: ReturnType<typeof createDesktopExtensionHost> | null = null;

afterEach(async () => {
  await host?.dispose();
  host = null;
});

const activate = async () => {
  const tabs = createDesktopTabRegistry([]);
  host = createDesktopExtensionHost({ tabs });
  host.register({ id: journalManifest.id, trusted: true, activate: activateJournal });
  await host.activate(journalManifest.id);
  return tabs;
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

  it("hands everything back when it deactivates", async () => {
    await activate();
    await host?.deactivate(journalManifest.id);

    expect(desktopPanelRegistry.get("journal-calendar.journal")).toBeUndefined();
    expect(desktopCommandRegistry.get("journal-calendar.today")).toBeUndefined();
    expect(appSettingsRegistry.getModule("extension-journal-calendar")).toBeUndefined();
  });
});
