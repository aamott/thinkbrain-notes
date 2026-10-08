// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// Keeps the settings save off Tauri IPC; the journal's own reads go through the
// workspace bridge, not these commands.
vi.mock("../../native/commands", () => ({
  invokeNativeCommand: vi.fn<() => Promise<unknown>>()
}));

import {
  activateJournal,
  journalManifest,
  journalMobileNewNoteActions
} from "./journal";
import { builtInExtensions } from "./index";
import { createDesktopExtensionHost } from "../desktopExtensionHost";
import { createDesktopTabRegistry } from "../../tabs/tabRegistry";
import {
  desktopCommandRegistry,
  type DesktopCommandContext
} from "../../commands/commandRegistry";
import { desktopPanelRegistry } from "../../panels/panelRegistryModel";
import { desktopEditorHeaderRegistry } from "../../tabs/editorHeaderRegistry.ts";
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
    stagedChanges: {}
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

  it("declares exactly one New-note action, pointing at the today command", () => {
    expect(journalMobileNewNoteActions).toHaveLength(1);
    expect(journalMobileNewNoteActions[0]).toEqual({
      id: "today",
      commandId: "today",
      label: "Today's journal",
      icon: "notebook-pen",
      requiresWorkspace: true
    });
  });

  it("wires the actions onto the journal descriptor bootstrap consumes", () => {
    // The constant alone is dead code unless builtInExtensions carries it —
    // bootstrap reads the descriptor, not this module.
    const descriptor = builtInExtensions.find((ext) => ext.manifest.id === "journal-calendar");
    expect(descriptor?.mobileNewNoteActions).toBe(journalMobileNewNoteActions);
  });

  it("registers the popout on the left, under a prefixed id", async () => {
    await activate();

    const panel = desktopPanelRegistry.get("journal-calendar.journal");
    expect(panel?.side).toBe("left");
    expect(panel?.label).toBe("Journal");
    expect(panel?.showWorkspaceSelector).toBe(true);
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

    const dom = await mount(tabs);

    expect(dom.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("aria-label"))
      .toBe("Week");
  });

  it("persists the view the strip switches to", async () => {
    const tabs = await activate();
    // Workspace-scoped (D80), so the write needs a workspace to land in.
    useSettingsStore.setState({ workspaceRootPath: "/vault", workspaceValues: {} });
    const dom = await mount(tabs);

    const week = dom.querySelector<HTMLButtonElement>('button[aria-label="Week"]');
    await act(async () => week?.click());

    expect(useSettingsStore.getState().getEffectiveValue(VIEW_KEY)).toBe("week");
  });

  it("reports the JournalError a palette command hits with no workspace open", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await activate();

    const today = desktopCommandRegistry.get("journal-calendar.today");
    const closePalette = vi.fn();
    // openToday rejects with JournalError("no-workspace"); the handler must
    // surface it, not leave an unhandled rejection pretending nothing happened.
    today?.handler({ closePalette } as unknown as DesktopCommandContext);
    await act(async () => Promise.resolve());

    expect(closePalette).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(
      expect.stringContaining("[journal]"),
      expect.objectContaining({ name: "JournalError" })
    );
    reported.mockRestore();
  });

  it("hands everything back when it deactivates", async () => {
    await activate();
    await host?.deactivate(journalManifest.id);

    expect(desktopPanelRegistry.get("journal-calendar.journal")).toBeUndefined();
    expect(desktopCommandRegistry.get("journal-calendar.today")).toBeUndefined();
    expect(appSettingsRegistry.getModule("extension-journal-calendar")).toBeUndefined();
  });
});

describe("the metadata widget and the settings behind it", () => {
  const FIELDS_KEY = "extension-journal-calendar.fieldDefinitions";

  const mountHeader = async (): Promise<HTMLDivElement> => {
    const header = desktopEditorHeaderRegistry.get("journal-calendar.metadata-widget");
    if (!header) throw new Error("The metadata widget did not register.");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        header.render({
          rootPath: "/vault",
          relativePath: "journal/2026/08/2026-08-07-1802.md",
          contents: "---\ndate: 2026-08-07\n---\n\nBread.\n"
        })
      );
    });
    return container;
  };

  /**
   * A field added in Settings has to appear on the note that is already open.
   * Nothing re-renders the editor when a setting changes, so without a
   * subscription the new field stays invisible until the user types.
   */
  it("picks up a field added while a note is open", async () => {
    await activate();
    const dom = await mountHeader();
    expect(dom.textContent).not.toContain("Mood");

    await act(async () => {
      useSettingsStore.getState().stageChange(
        FIELDS_KEY,
        JSON.stringify([{ id: "mood", label: "Mood", type: "text" }])
      );
    });

    // The affordance only exists once there is a field to fill in, and the
    // label itself appears when it is expanded.
    const add = dom.querySelector<HTMLButtonElement>("button");
    expect(add?.textContent).toBe("Info Tracker");
    await act(async () => add?.click());
    expect(dom.textContent).toContain("Mood");
  });

  /**
   * `applies` runs inside `EditorHeaderSlot`'s `useMemo` during render, so a
   * `root` setting `normalizeRoot` rejects (".." escapes the workspace, and a
   * hand-edited settings file can carry it) must degrade to "not under the
   * journal folder" — not crash every open editor tab through `TabBoundary`.
   */
  it("answers false from `applies` rather than throwing on an invalid root", async () => {
    await activate();
    useSettingsStore.getState().stageChange("extension-journal-calendar.root", "..");

    const header = desktopEditorHeaderRegistry.get("journal-calendar.metadata-widget");
    const context = {
      rootPath: "/vault",
      relativePath: "notes/anything.md",
      contents: "No frontmatter here.\n"
    };

    expect(() => header?.applies?.(context)).not.toThrow();
    expect(header?.applies?.(context)).toBe(false);
  });

  /**
   * A bad root only invalidates the folder check — a note that carries one of
   * the user's configured fields is a journal entry wherever it lives (D28).
   */
  it("still honors the configured-fields check while the root is invalid", async () => {
    await activate();
    useSettingsStore.getState().stageChange("extension-journal-calendar.root", "..");
    useSettingsStore.getState().stageChange(
      FIELDS_KEY,
      JSON.stringify([{ id: "mood", label: "Mood", type: "text" }])
    );

    const header = desktopEditorHeaderRegistry.get("journal-calendar.metadata-widget");
    const applies = header?.applies?.({
      rootPath: "/vault",
      relativePath: "notes/anything.md",
      contents: "---\nmood: ok\n---\n\nBody.\n"
    });

    expect(applies).toBe(true);
  });
});
