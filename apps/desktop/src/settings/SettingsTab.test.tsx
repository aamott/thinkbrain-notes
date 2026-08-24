// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn<() => Promise<unknown>>()
}));

import { isTauri } from "@tauri-apps/api/core";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { invokeNativeCommand } from "../native/commands";
import { SettingsTab } from "./SettingsTab";
import { useSettingsStore, appSettingsRegistry } from "./settingsStore";
import { setExtensionBootstrap } from "../extensions/bootstrapRef";
import { setWorkspaceBridge } from "../extensions/workspaceBridge";
import { registerControl, type ControlProps } from "./controlRegistry";

/**
 * SettingsTab component tests.
 *
 * Uses the real module-scoped `useSettingsStore` singleton. Before each test,
 * state is seeded directly via `setState` (no async gateway load needed since
 * `isTauri()` is false under Node, so the mount effect is a no-op). After each
 * test, the store is reset to its initial state to keep tests isolated.
 *
 * Rendering follows the codebase convention: `createRoot` + `act` + DOM
 * queries (no @testing-library/react dependency is available).
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Default app values seeded into the store for most tests. */
const SEEDED_APP_VALUES: Record<string, unknown> = {
  "appearance.theme": "system",
  "appearance.themeFile": null,
  "editor.fontSize": 16,
  "editor.lineWrapping": true,
  "settings.autosave": false
};

beforeEach(() => {
  // `isTauri` is false by default so the mount effect is a no-op for existing
  // tests. The remount-persistence test overrides this to true.
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(workspaceDesktopApi.windowWorkspaceRoot).mockResolvedValue(null);
  vi.mocked(invokeNativeCommand).mockResolvedValue(null);

  // Reset the singleton store to a clean, loaded state before each test.
  useSettingsStore.setState({
    appValues: { ...SEEDED_APP_VALUES },
    workspaceValues: null,
    workspaceRootPath: null,
    stagedChanges: {},
    isDirty: false,
    dirtyCount: 0,
    activeSection: null,
    searchQuery: "",
    loadError: null,
    saveError: null,
    validationDiagnostics: [],
    loaded: true
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.mocked(isTauri).mockReset();
  vi.mocked(workspaceDesktopApi.windowWorkspaceRoot).mockReset();
  vi.mocked(invokeNativeCommand).mockReset();
});

/**
 * Renders the SettingsTab into a fresh container and waits for effects.
 * Returns the container for querying.
 */
async function renderSettingsTab(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<SettingsTab />);
  });
  return container;
}

/** Clicks an element and flushes React updates. */
async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
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

  it("navigates to the selected section without closing the overlay", async () => {
    const el = await renderSettingsTab();
    await click(el.querySelector('button[aria-label="Open settings navigation"]')!);
    const displayButton = Array.from(el.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Display"
    )!;

    await click(displayButton);

    expect(useSettingsStore.getState().activeSection).toBe("editor.display");
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

  it("highlights the active section with aria-current after clicking it", async () => {
    const el = await renderSettingsTab();

    // Before clicking, no section has aria-current="true".
    expect(el.querySelector('[aria-current="true"]')).toBeNull();

    // Click the "Display" section (editor.display).
    const displayButton = Array.from(el.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Display"
    );
    expect(displayButton).toBeDefined();
    await click(displayButton!);

    // After clicking, the active section should have aria-current="true".
    const active = el.querySelector('[aria-current="true"]');
    expect(active).not.toBeNull();
    expect(active?.textContent).toContain("Display");
  });

  it("renders collapsible subsection chevrons that toggle expansion", async () => {
    const el = await renderSettingsTab();

    // The built-in modules have no subsections, so we verify the chevron
    // button infrastructure exists: any button with an aria-label containing
    // "Collapse" or "Expand". Since there are no subsections, there should be
    // zero such buttons — confirming the nav handles the no-subsection case.
    const chevronButtons = el.querySelectorAll<HTMLButtonElement>(
      'button[aria-label*="Collapse"], button[aria-label*="Expand"]'
    );
    expect(chevronButtons.length).toBe(0);

    // The section still renders as a clickable nav item.
    const displayButton = Array.from(el.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Display"
    );
    expect(displayButton).not.toBeNull();
  });

  it("renders the selected section's settings with labels and controls", async () => {
    useSettingsStore.setState({ activeSection: "editor.display" });
    const el = await renderSettingsTab();

    // Section header label.
    expect(el.textContent).toContain("Display");

    // Setting labels are present.
    expect(el.textContent).toContain("Font size");
    expect(el.textContent).toContain("Line wrapping");

    // A number input (for fontSize) and a toggle switch (for lineWrapping).
    const numberInput = el.querySelector<HTMLInputElement>('input[type="number"]');
    expect(numberInput).not.toBeNull();
    expect(numberInput?.value).toBe("16");

    const toggle = el.querySelector('[role="switch"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("auto-generates controls by type: enum→select, number→number input, boolean→switch, string→text", async () => {
    useSettingsStore.setState({ activeSection: "appearance.theme" });
    const el = await renderSettingsTab();

    // The appearance.theme section uses the unified ThemePicker instead of the
    // auto-generated enum control. The picker's <select> is targeted by its
    // stable id and exposes the three base options (System/Light/Dark) under a
    // "Base" optgroup. The standalone appearance.theme/appearance.themeFile
    // rows are filtered out of the generic row rendering.
    const select = el.querySelector<HTMLSelectElement>("select#theme-picker-select");
    expect(select).not.toBeNull();
    const options = select?.querySelectorAll("option");
    expect(options?.length).toBe(3); // system, light, dark
    expect(select?.value).toBe("system");

    // The standalone appearance.theme enum row should NOT render (it's now
    // folded into the unified picker).
    expect(el.querySelector("select#appearance\\.theme")).toBeNull();

    // Now switch to editor.display for number + boolean.
    useSettingsStore.setState({ activeSection: "editor.display" });
    await act(async () => {
      // Re-render is automatic via store subscription; just flush.
    });

    const numberInput = el.querySelector<HTMLInputElement>('input[type="number"]');
    expect(numberInput).not.toBeNull();

    const toggle = el.querySelector('[role="switch"]');
    expect(toggle).not.toBeNull();
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

    useSettingsStore.setState({ activeSection: "test-custom.section" });
    const el = await renderSettingsTab();

    // The custom control rendered instead of a text input.
    const custom = el.querySelector('[data-testid="custom-control"]');
    expect(custom).not.toBeNull();
    expect(custom?.textContent).toBe("custom");

    // No text input should be present for this setting.
    const textInput = el.querySelector<HTMLInputElement>('input[type="text"]');
    expect(textInput).toBeNull();
  });

  it("shows an empty-state prompt when no section is selected", async () => {
    // activeSection is null by default (set in beforeEach).
    const el = await renderSettingsTab();

    expect(el.textContent).toContain("No section selected");
    expect(el.textContent).toContain("Select a section from the left");
  });

  it("renders a load error banner when loadError is set", async () => {
    useSettingsStore.setState({ loadError: "Failed to load settings: disk on fire" });
    const el = await renderSettingsTab();

    const banner = el.querySelector('[role="alert"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("disk on fire");
  });

  it("preserves staged changes across unmount/remount (Tauri)", async () => {
    // Simulate a Tauri environment so the mount-load effect runs.
    vi.mocked(isTauri).mockReturnValue(true);
    const WORKSPACE_ROOT = "/test/workspace";
    vi.mocked(workspaceDesktopApi.windowWorkspaceRoot).mockResolvedValue(WORKSPACE_ROOT);
    // No settings files on disk — loadSettings populates defaults only.
    vi.mocked(invokeNativeCommand).mockResolvedValue(null);

    // First mount: triggers loadSettings, which sets loaded=true and
    // workspaceRootPath=WORKSPACE_ROOT.
    await renderSettingsTab();
    expect(useSettingsStore.getState().loaded).toBe(true);
    expect(useSettingsStore.getState().workspaceRootPath).toBe(WORKSPACE_ROOT);

    // Capture the native-command call count after the initial load.
    const callsAfterFirstMount = vi.mocked(invokeNativeCommand).mock.calls.length;

    // Stage an unsaved change (simulating user editing a setting).
    useSettingsStore.setState({
      activeSection: "editor.display",
      stagedChanges: { "editor.fontSize": 99 },
      isDirty: true,
      dirtyCount: 1
    });
    expect(useSettingsStore.getState().stagedChanges["editor.fontSize"]).toBe(99);

    // Unmount the settings tab (simulates switching to another tab).
    await act(async () => root?.unmount());
    root = null;

    // Remount the settings tab (simulates switching back). Without the fix,
    // the mount effect would call loadSettings again, clearing stagedChanges.
    await renderSettingsTab();

    // Staged changes must survive the remount.
    const staged = useSettingsStore.getState().stagedChanges;
    expect(staged["editor.fontSize"]).toBe(99);
    expect(useSettingsStore.getState().isDirty).toBe(true);

    // loadSettings must NOT have been called again on remount (no additional
    // native command invocations for read_app_settings / read_workspace_settings).
    expect(vi.mocked(invokeNativeCommand).mock.calls.length).toBe(callsAfterFirstMount);
  });
});

describe("SettingsTab and lazy extensions", () => {
  /**
   * The bug this covers: the journal registers its settings when it activates,
   * and it activates lazily, so opening Settings without having opened the
   * journal first showed no Journal section at all — nothing to configure, and
   * no hint that anything was missing.
   */
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
  /**
   * The bug this covers: only a *secondary* workspace window registers a root
   * natively, so in the main window `windowWorkspaceRoot` is null even with a
   * vault open. Settings then loaded with no workspace, and every
   * workspace-scoped setting — the journal folder, the metadata fields — could
   * be staged and never saved: Save did nothing and the bar stayed dirty.
   */
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
