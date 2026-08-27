// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Tauri core `isTauri` check so we can toggle the mount-load branch.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn<() => boolean>()
}));

// Mock the workspace adapter so `windowWorkspaceRoot` is controllable.
vi.mock("../workspace/workspaceAdapter", () => ({
  workspaceDesktopApi: {
    windowWorkspaceRoot: vi.fn<() => Promise<string | null>>()
  }
}));

// Mock native commands so `loadSettings` (via the native gateway) doesn't hit
// Tauri IPC. Returns null by default (no settings files on disk).
vi.mock("../native/commands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../native/commands")>();
  return {
    ...actual,
    invokeNativeCommand: vi.fn<(command: string) => Promise<unknown>>()
  };
});

import { isTauri } from "@tauri-apps/api/core";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { invokeNativeCommand } from "../native/commands";
import { SettingsTab } from "./SettingsTab";
import { useSettingsStore, appSettingsRegistry } from "./settingsStore";
import { setExtensionBootstrap } from "../extensions/bootstrapRef";
import { setWorkspaceBridge } from "../extensions/workspaceBridge";
import { registerControl, type ControlProps } from "./controlRegistry";
import { createScrollSpyHarness } from "./scrollSpyTestUtils";
import {
  createSettingsTestHarness,
  seedSettingsStore
} from "./settingsTestHelpers";

/** SettingsTab DOM tests backed by the real module-scoped settings store. */

const harness = createSettingsTestHarness();
const scrollSpy = createScrollSpyHarness();

beforeEach(() => {
  scrollSpy.install();

  // `isTauri` is false by default so the mount effect is a no-op for existing
  // tests. The remount-persistence test overrides this to true.
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(workspaceDesktopApi.windowWorkspaceRoot).mockResolvedValue(null);
  vi.mocked(invokeNativeCommand).mockImplementation(async (command) =>
    command === "list_themes" ? [] : null
  );

  // Reset the singleton store to a clean, loaded state before each test.
  seedSettingsStore();
});

afterEach(async () => {
  await harness.unmount();
  vi.mocked(isTauri).mockReset();
  vi.mocked(workspaceDesktopApi.windowWorkspaceRoot).mockReset();
  vi.mocked(invokeNativeCommand).mockReset();
  scrollSpy.restore();
});

/** Renders SettingsTab into a fresh container and flushes effects. */
async function renderSettingsTab(): Promise<HTMLDivElement> {
  return harness.render(<SettingsTab />);
}

/** Clicks an element and flushes React updates. */
async function click(element: Element): Promise<void> {
  return harness.click(element);
}

/** Counts only settings-document reads, excluding controls' native queries. */
function settingsReadCallCount(): number {
  return vi
    .mocked(invokeNativeCommand)
    .mock.calls.filter(
      ([command]) =>
        command === "read_app_settings" || command === "read_workspace_settings"
    ).length;
}

/** Publishes one visible content section to the scroll-spy observer. */
async function intersectSection(section: Element): Promise<void> {
  await act(async () => {
    scrollSpy.intersect(section);
  });
}

describe("SettingsTab", () => {
  it("renders the header, navigation, and content layout without the old save bar", async () => {
    const el = await renderSettingsTab();

    expect(el.querySelector('[data-testid="settings-header-bar"]')).not.toBeNull();

    const nav = el.querySelector<HTMLElement>("#settings-navigation");
    expect(nav).not.toBeNull();
    expect(nav?.querySelector('[role="tree"]')).not.toBeNull();
    expect(el.textContent).toContain("Application");
    expect(el.textContent).toContain("Theme");
    expect(el.textContent).toContain("Display");
    expect(el.textContent).not.toContain("Workspace");
    expect(el.querySelector("main")).not.toBeNull();
    expect(el.querySelectorAll('[role="toolbar"][aria-label="Settings actions"]')).toHaveLength(1);
    expect(el.querySelector('[data-testid="settings-save-bar"]')).toBeNull();
  });

  it("gives the hamburger button the navigation ARIA relationship", async () => {
    const el = await renderSettingsTab();
    const hamburger = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Open settings navigation"]'
    );

    expect(hamburger).not.toBeNull();
    expect(hamburger?.getAttribute("aria-controls")).toBe("settings-navigation");
    expect(hamburger?.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the navigation and scrim from the hamburger button", async () => {
    const el = await renderSettingsTab();
    const hamburger = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Open settings navigation"]'
    )!;

    await click(hamburger);

    expect(hamburger.getAttribute("aria-expanded")).toBe("true");
    expect(el.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("true");
    expect(el.querySelector('[data-testid="settings-navigation-scrim"]')).not.toBeNull();
  });

  it("closes the navigation from its close button", async () => {
    const el = await renderSettingsTab();
    await click(el.querySelector('button[aria-label="Open settings navigation"]')!);
    const nav = el.querySelector<HTMLElement>("#settings-navigation")!;
    const closeButton = nav.querySelector<HTMLButtonElement>(
      'button[aria-label="Close settings navigation"]'
    )!;

    await click(closeButton);

    expect(nav.getAttribute("data-open")).toBe("false");
    expect(el.querySelector('[data-testid="settings-navigation-scrim"]')).toBeNull();
  });

  it("closes the navigation from the scrim", async () => {
    const el = await renderSettingsTab();
    await click(el.querySelector('button[aria-label="Open settings navigation"]')!);
    const scrim = el.querySelector<HTMLButtonElement>(
      '[data-testid="settings-navigation-scrim"]'
    )!;

    await click(scrim);

    expect(el.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("false");
    expect(el.querySelector('[data-testid="settings-navigation-scrim"]')).toBeNull();
  });

  it("closes the navigation when Escape is pressed", async () => {
    const el = await renderSettingsTab();
    await click(el.querySelector('button[aria-label="Open settings navigation"]')!);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(el.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("false");
    expect(el.querySelector('[data-testid="settings-navigation-scrim"]')).toBeNull();
  });

  it("scrolls to the selected section without closing the overlay", async () => {
    const el = await renderSettingsTab();
    await click(el.querySelector('button[aria-label="Open settings navigation"]')!);
    const displayButton = Array.from(el.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Display"
    )!;

    await click(displayButton);

    expect(scrollSpy.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start"
    });
    expect(scrollSpy.scrollIntoView.mock.instances.at(-1)).toBe(
      el.querySelector("#settings-section-app\\:editor\\.display")
    );
    // Clicks do not own active state; the observer updates it after scrolling.
    expect(useSettingsStore.getState().activeSection).toBeNull();
    // Nav stays open so the user can browse multiple sections.
    expect(el.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("true");
  });

  it("shows the Workspace group when a workspace is open", async () => {
    useSettingsStore.setState({ workspaceValues: { "sync.destination": "" } });
    const el = await renderSettingsTab();

    expect(el.textContent).toContain("Workspace");
    expect(el.textContent).toContain("Git link");
    expect(el.textContent).toContain("Cloud copies");
  });

  it("highlights the active section with aria-current after scroll-spy updates", async () => {
    const el = await renderSettingsTab();

    // Before an intersection, no section has aria-current="true".
    expect(el.querySelector('[aria-current="true"]')).toBeNull();

    await intersectSection(el.querySelector("#settings-section-app\\:editor\\.display")!);

    // The observer drives both the store and navigation highlight.
    expect(useSettingsStore.getState().activeSection).toBe("app:editor.display");
    const active = el.querySelector('[aria-current="true"]');
    expect(active).not.toBeNull();
    expect(active?.textContent).toContain("Display");
    expect(el.querySelector('[aria-label="Settings location"]')?.textContent).toContain(
      "Editor›Display"
    );
  });

  it("renders all sections and their controls without a selection or empty-state", async () => {
    const el = await renderSettingsTab();

    expect(el.querySelector("#settings-section-app\\:appearance\\.theme")).not.toBeNull();
    expect(el.querySelector("#settings-section-app\\:editor\\.display")).not.toBeNull();
    expect(el.querySelector("#settings-section-app\\:settings\\.general")).not.toBeNull();

    // Settings from separate sections coexist in the document.
    expect(el.textContent).toContain("Font size");
    expect(el.textContent).toContain("Line wrapping");
    expect(el.textContent).toContain("Autosave changes");
    expect(el.textContent).not.toContain("No section selected");

    // A number input (for fontSize) and a toggle switch (for lineWrapping).
    const numberInput = el.querySelector<HTMLInputElement>('input[type="number"]');
    expect(numberInput).not.toBeNull();
    expect(numberInput?.value).toBe("16");

    const toggle = el.querySelector('[role="switch"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("replaces standalone theme rows with the unified ThemePicker", async () => {
    const el = await renderSettingsTab();

    const select = el.querySelector<HTMLSelectElement>("select#theme-picker-select");
    expect(select).not.toBeNull();
    expect(select?.querySelectorAll("option").length).toBe(3); // system, light, dark
    expect(select?.value).toBe("system");
    // The standalone appearance.theme select is filtered out.
    expect(el.querySelector("select#appearance\\.theme")).toBeNull();
  });

  it("calls stageChange when a control is interacted with", async () => {
    useSettingsStore.setState({ activeSection: "editor.display" });
    const el = await renderSettingsTab();

    const toggle = el.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(toggle).not.toBeNull();
    await click(toggle!);

    // The store should now have a staged change for editor.lineWrapping.
    const staged = useSettingsStore.getState().stagedChanges;
    expect(staged["editor.lineWrapping"]).toBe(false);
  });

  it("uses a registered custom control instead of the auto-generated one", async () => {
    // Register a custom control key and a temporary setting using it.
    const CUSTOM_KEY = "test-custom-control";
    const CustomControl = ({ definition }: ControlProps) => (
      <span data-testid="custom-control" data-key={definition.key}>
        custom
      </span>
    );
    registerControl(CUSTOM_KEY, CustomControl);

    // Register a temporary module with a setting that uses the custom control.
    const tempModule = {
      id: "test-custom",
      label: "Test Custom",
      scope: "app" as const,
      sections: [
        {
          id: "test-custom.section",
          label: "Custom Section",
          settings: [
            {
              key: "customSetting",
              type: "string" as const,
              default: "hello",
              scope: "app" as const,
              section: "test-custom.section",
              label: "Custom Setting",
              description: "A custom-controlled setting.",
              control: CUSTOM_KEY
            }
          ]
        }
      ]
    };
    appSettingsRegistry.register(tempModule);

    useSettingsStore.setState({ activeSection: "app:test-custom.section" });
    const el = await renderSettingsTab();

    // The custom control rendered instead of a text input.
    const custom = el.querySelector('[data-testid="custom-control"]');
    expect(custom).not.toBeNull();
    expect(custom?.textContent).toBe("custom");

    // No generated text input appears inside this custom setting's section.
    const textInput = el.querySelector<HTMLInputElement>(
      "#settings-section-app\\:test-custom\\.section input[type=\"text\"]"
    );
    expect(textInput).toBeNull();
  });

  it("renders a load error banner when loadError is set", async () => {
    useSettingsStore.setState({ loadError: "Failed to load settings: disk on fire" });
    const el = await renderSettingsTab();

    const banner = el.querySelector('[role="alert"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("disk on fire");
  });

  it("preserves staged changes across unmount/remount (Tauri)", async () => {
    // Simulate the native mount-load path.
    vi.mocked(isTauri).mockReturnValue(true);
    const WORKSPACE_ROOT = "/test/workspace";
    vi.mocked(workspaceDesktopApi.windowWorkspaceRoot).mockResolvedValue(WORKSPACE_ROOT);
    vi.mocked(invokeNativeCommand).mockImplementation(async (command) =>
      command === "list_themes" ? [] : null
    );

    // The first mount loads defaults for the current workspace.
    await renderSettingsTab();
    expect(useSettingsStore.getState().loaded).toBe(true);
    expect(useSettingsStore.getState().workspaceRootPath).toBe(WORKSPACE_ROOT);

    const callsAfterFirstMount = settingsReadCallCount();

    // Stage an unsaved edit, then simulate switching away and back.
    useSettingsStore.setState({
      activeSection: "editor.display",
      stagedChanges: { "editor.fontSize": 99 },
      isDirty: true,
      dirtyCount: 1
    });
    expect(useSettingsStore.getState().stagedChanges["editor.fontSize"]).toBe(99);

    await harness.unmount();

    await renderSettingsTab();

    const staged = useSettingsStore.getState().stagedChanges;
    expect(staged["editor.fontSize"]).toBe(99);
    expect(useSettingsStore.getState().isDirty).toBe(true);

    // Remounting must not reread documents and clear staged changes.
    expect(settingsReadCallCount()).toBe(callsAfterFirstMount);
  });
});

describe("SettingsTab and lazy extensions", () => {
  /** Opening settings activates extensions so lazy schemas become available. */
  it("wakes every extension so their sections exist", async () => {
    const activateAll = vi.fn(async () => undefined);
    setExtensionBootstrap({
      entries: () => [],
      activateAll,
      addLocalExtension: () => undefined,
      removeLocalExtension: async () => undefined,
      subscribe: () => () => undefined,
      dispose: async () => undefined
    });

    await renderSettingsTab();

    expect(activateAll).toHaveBeenCalled();
    setExtensionBootstrap(null);
  });
});

describe("finding the workspace a setting belongs to", () => {
  /** The main window falls back to the shell bridge when no native root exists. */
  it("falls back to the shell's open workspace", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(workspaceDesktopApi.windowWorkspaceRoot).mockResolvedValue(null);
    useSettingsStore.setState({ loaded: false, workspaceRootPath: null });
    setWorkspaceBridge({
      rootPath: "/vault",
      openNote: () => undefined,
      openTab: () => undefined
    });

    await renderSettingsTab();
    await act(async () => undefined);

    expect(useSettingsStore.getState().workspaceRootPath).toBe("/vault");
    setWorkspaceBridge(null);
  });

  it("prefers the window's own root when it has one", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(workspaceDesktopApi.windowWorkspaceRoot).mockResolvedValue("/window-vault");
    useSettingsStore.setState({ loaded: false, workspaceRootPath: null });
    setWorkspaceBridge({
      rootPath: "/vault",
      openNote: () => undefined,
      openTab: () => undefined
    });

    await renderSettingsTab();
    await act(async () => undefined);

    expect(useSettingsStore.getState().workspaceRootPath).toBe("/window-vault");
    setWorkspaceBridge(null);
  });
});
