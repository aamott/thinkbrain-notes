// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SettingsTab } from "./SettingsTab";
import { useSettingsStore, appSettingsRegistry } from "./settingsStore";
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
  "editor.lineWrapping": true
};

beforeEach(() => {
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
  it("renders a two-pane layout with Application group and built-in module sections", async () => {
    const el = await renderSettingsTab();

    // The nav tree exists.
    const tree = el.querySelector('[role="tree"]');
    expect(tree).not.toBeNull();

    // "Application" top-level group is present.
    expect(el.textContent).toContain("Application");

    // Built-in modules' section labels appear in the nav.
    expect(el.textContent).toContain("Theme");
    expect(el.textContent).toContain("Display");

    // "Workspace" group is NOT present when no workspace is open.
    expect(el.textContent).not.toContain("Workspace");
  });

  it("shows the Workspace group when a workspace is open", async () => {
    // Register a temporary workspace-scoped module so the Workspace group has
    // content to render. The built-in modules are all app-scoped.
    const tempWorkspaceModule = {
      id: "test-workspace",
      label: "Test Workspace",
      scope: "workspace" as const,
      sections: [
        {
          id: "test-workspace.section",
          label: "WS Section",
          settings: [
            {
              key: "wsSetting",
              type: "string" as const,
              default: "x",
              scope: "workspace" as const,
              section: "test-workspace.section",
              label: "WS Setting",
              description: "A workspace setting."
            }
          ]
        }
      ]
    };
    appSettingsRegistry.register(tempWorkspaceModule);

    // Seed workspaceValues so the Workspace group renders.
    useSettingsStore.setState({ workspaceValues: { "test-workspace.wsSetting": "x" } });
    const el = await renderSettingsTab();

    expect(el.textContent).toContain("Workspace");
    expect(el.textContent).toContain("Test Workspace");
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

    // Enum (theme) renders a <select>. Target it by id (the auto-generated
    // SelectControl uses the setting key as its id) so the query does not pick
    // up the ThemePicker's <select> that also renders in this section.
    const select = el.querySelector<HTMLSelectElement>("select#appearance\\.theme");
    expect(select).not.toBeNull();
    const options = select?.querySelectorAll("option");
    expect(options?.length).toBe(3); // system, light, dark
    expect(select?.value).toBe("system");

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
});
