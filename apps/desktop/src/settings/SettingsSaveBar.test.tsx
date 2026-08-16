// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsSaveBar } from "./SettingsSaveBar";
import { pickFilePath, saveFilePath } from "../native/dialogs";
import { readTextFileNative, writeTextFileNative } from "../native/fs";
import { SettingsContent } from "./SettingsContent";
import { useSettingsStore } from "./settingsStore";

/**
 * SettingsSaveBar + inline validation error tests.
 *
 * Uses the real module-scoped `useSettingsStore` singleton. Before each test,
 * state is seeded directly via `setState`. The `saveSettings` action is spied
 * with `vi.fn` so tests can assert it was called without hitting the native
 * gateway (which is unavailable under Node). After each test, the store is
 * reset to its initial state.
 *
 * The save bar now has 4 buttons (left-to-right): Export, Import, Reset, Save.
 * Export and Import are always enabled; Reset and Save are disabled when not
 * dirty.
 *
 * Rendering follows the codebase convention: `createRoot` + `act` + DOM
 * queries (no @testing-library/react dependency is available).
 */

// Mock the native dialogs/fs modules so export/import don't hit Tauri.
vi.mock("../native/dialogs", () => ({
  saveFilePath: vi.fn<(title: string, defaultName: string) => Promise<string | null>>(),
  pickFilePath: vi.fn<(title?: string) => Promise<string | null>>()
}));
vi.mock("../native/fs", () => ({
  writeTextFileNative: vi.fn<(path: string, contents: string) => Promise<boolean>>(),
  readTextFileNative: vi.fn<(path: string) => Promise<string | null>>()
}));

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
  // Reset the singleton store to a clean, loaded state before each test.
  // Replace saveSettings/resetStaged/resetSection with spies so we can assert
  // calls and control the outcome without hitting the native gateway.
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
    loaded: true,
    saveSettings: vi.fn(async () => ({ success: true, diagnostics: [] })),
    resetStaged: vi.fn(() => undefined),
    resetSection: vi.fn(() => undefined)
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/**
 * Renders a component into a fresh container and waits for effects.
 * Returns the container for querying.
 */
async function render(component: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(component);
  });
  return container;
}

/** Clicks an element and flushes React updates. */
async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("SettingsSaveBar", () => {
  it("renders Export, Import, Reset, and Save buttons", async () => {
    const el = await render(<SettingsSaveBar />);

    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
    // Export, Import, Reset, Save = 4 buttons.
    expect(buttons).toHaveLength(4);

    const [exportBtn, importBtn, resetBtn, saveBtn] = buttons;

    // Export and Import are always enabled.
    expect(exportBtn!.disabled).toBe(false);
    expect(importBtn!.disabled).toBe(false);
    // Reset and Save are disabled when not dirty.
    expect(resetBtn!.disabled).toBe(true);
    expect(saveBtn!.disabled).toBe(true);
    expect(saveBtn!.textContent).toBe("Save");
  });

  it("enables Reset and Save when dirty and shows dirty count", async () => {
    useSettingsStore.setState({ isDirty: true, dirtyCount: 3 });
    const el = await render(<SettingsSaveBar />);

    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
    const [, , resetBtn, saveBtn] = buttons;

    expect(resetBtn!.disabled).toBe(false);
    expect(saveBtn!.disabled).toBe(false);
    expect(saveBtn!.textContent).toBe("Save (3)");
  });

  it("clicking Save calls saveSettings from the store", async () => {
    useSettingsStore.setState({ isDirty: true, dirtyCount: 1 });
    const el = await render(<SettingsSaveBar />);

    const saveBtn = Array.from(el.querySelectorAll<HTMLButtonElement>("button"))[3]!;
    await click(saveBtn);

    const { saveSettings } = useSettingsStore.getState();
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("clicking Reset calls resetStaged from the store", async () => {
    useSettingsStore.setState({ isDirty: true, dirtyCount: 1 });
    const el = await render(<SettingsSaveBar />);

    const resetBtn = Array.from(el.querySelectorAll<HTMLButtonElement>("button"))[2]!;
    await click(resetBtn);

    const { resetStaged } = useSettingsStore.getState();
    expect(resetStaged).toHaveBeenCalledTimes(1);
  });

  it("displays saveError in the bar when set", async () => {
    useSettingsStore.setState({
      isDirty: true,
      dirtyCount: 1,
      saveError: "Failed to save settings: disk full"
    });
    const el = await render(<SettingsSaveBar />);

    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("disk full");
  });

  it("does not display saveError when null", async () => {
    useSettingsStore.setState({ isDirty: true, dirtyCount: 1, saveError: null });
    const el = await render(<SettingsSaveBar />);

    // The toolbar itself has role="toolbar"; no role="alert" should exist.
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("SettingsSaveBar export/import buttons", () => {
  it("Export button has title and aria-label for accessibility", async () => {
    const el = await render(<SettingsSaveBar />);
    const exportBtn = el.querySelector<HTMLButtonElement>('button[title="Export settings"]');
    expect(exportBtn).not.toBeNull();
    expect(exportBtn!.getAttribute("aria-label")).toBe("Export settings");
  });

  it("Import button has title and aria-label for accessibility", async () => {
    const el = await render(<SettingsSaveBar />);
    const importBtn = el.querySelector<HTMLButtonElement>('button[title="Import settings"]');
    expect(importBtn).not.toBeNull();
    expect(importBtn!.getAttribute("aria-label")).toBe("Import settings");
  });
});

describe("SettingsSaveBar autosave mode", () => {
  it("hides Save/Reset buttons and shows 'Autosave enabled' when autosave is on", async () => {
    // Enable autosave via appValues (effective value resolves staged > app > default).
    useSettingsStore.setState({
      appValues: { ...SEEDED_APP_VALUES, "settings.autosave": true },
      isDirty: true,
      dirtyCount: 1
    });
    const el = await render(<SettingsSaveBar />);

    // Export/Import remain; Save/Reset are hidden.
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
    const labels = buttons.map((b) => b.getAttribute("aria-label"));
    expect(labels).toContain("Export settings");
    expect(labels).toContain("Import settings");
    // No Save or Reset buttons (their text content would be "Save"/"Reset").
    const texts = buttons.map((b) => b.textContent);
    expect(texts).not.toContain("Reset");
    expect(texts.some((t) => t?.startsWith("Save"))).toBe(false);

    // The autosave label is rendered.
    expect(el.textContent).toContain("Autosave enabled");
  });

  it("honors a staged autosave toggle over the app value", async () => {
    // appValues has autosave=false, but a staged toggle to true wins.
    useSettingsStore.setState({
      appValues: { ...SEEDED_APP_VALUES, "settings.autosave": false },
      stagedChanges: { "settings.autosave": true },
      isDirty: true,
      dirtyCount: 1
    });
    const el = await render(<SettingsSaveBar />);

    expect(el.textContent).toContain("Autosave enabled");
    const texts = Array.from(el.querySelectorAll<HTMLButtonElement>("button")).map(
      (b) => b.textContent
    );
    expect(texts).not.toContain("Reset");
  });
});

describe("SettingsContent inline validation errors", () => {
  it("renders role=alert with the diagnostic message for a matching key", async () => {
    useSettingsStore.setState({
      activeSection: "editor.display",
      validationDiagnostics: [
        {
          code: "range",
          message: "Font size must be at least 8",
          severity: "error",
          path: "editor.fontSize"
        }
      ]
    });
    const el = await render(<SettingsContent />);

    const alerts = el.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.textContent).toBe("Font size must be at least 8");
  });

  it("clears inline errors when diagnostics are emptied", async () => {
    useSettingsStore.setState({
      activeSection: "editor.display",
      validationDiagnostics: [
        {
          code: "range",
          message: "Font size must be at least 8",
          severity: "error",
          path: "editor.fontSize"
        }
      ]
    });
    const el = await render(<SettingsContent />);

    expect(el.querySelectorAll('[role="alert"]').length).toBe(1);

    // Clear diagnostics (simulates a successful re-save or staging a fix).
    await act(async () => {
      useSettingsStore.setState({ validationDiagnostics: [] });
    });

    expect(el.querySelectorAll('[role="alert"]').length).toBe(0);
  });

  it("does not render errors for keys not in the active section", async () => {
    useSettingsStore.setState({
      activeSection: "appearance.theme",
      validationDiagnostics: [
        {
          code: "range",
          message: "Font size must be at least 8",
          severity: "error",
          path: "editor.fontSize"
        }
      ]
    });
    const el = await render(<SettingsContent />);

    // editor.fontSize is not in the appearance.theme section, so no alert.
    expect(el.querySelectorAll('[role="alert"]').length).toBe(0);
  });
});

describe("SettingsContent per-section reset button", () => {
  it("renders a reset button in the section header", async () => {
    useSettingsStore.setState({ activeSection: "editor.display" });
    const el = await render(<SettingsContent />);

    const resetBtn = el.querySelector<HTMLButtonElement>(
      'button[title="Reset this section to defaults"]'
    );
    expect(resetBtn).not.toBeNull();
  });

  it("disables the reset button when there are no staged changes for the section", async () => {
    useSettingsStore.setState({
      activeSection: "editor.display",
      stagedChanges: {}
    });
    const el = await render(<SettingsContent />);

    const resetBtn = el.querySelector<HTMLButtonElement>(
      'button[title="Reset this section to defaults"]'
    );
    expect(resetBtn!.disabled).toBe(true);
  });

  it("enables the reset button when there are staged changes for the section", async () => {
    useSettingsStore.setState({
      activeSection: "editor.display",
      stagedChanges: { "editor.fontSize": 20 }
    });
    const el = await render(<SettingsContent />);

    const resetBtn = el.querySelector<HTMLButtonElement>(
      'button[title="Reset this section to defaults"]'
    );
    expect(resetBtn!.disabled).toBe(false);
  });

  it("clicking the reset button calls resetSection with the active section", async () => {
    useSettingsStore.setState({
      activeSection: "editor.display",
      stagedChanges: { "editor.fontSize": 20 }
    });
    const el = await render(<SettingsContent />);

    const resetBtn = el.querySelector<HTMLButtonElement>(
      'button[title="Reset this section to defaults"]'
    )!;
    await click(resetBtn);

    const { resetSection } = useSettingsStore.getState();
    expect(resetSection).toHaveBeenCalledWith("editor.display");
  });
});

/**
 * Export and import each have three outcomes, not two: it worked, the user
 * dismissed the dialog, or it failed. Reporting nothing on the last two ran
 * them together and let a failed export look exactly like a cancelled one.
 */
describe("SettingsSaveBar export/import outcomes", () => {
  const statusOf = (host: HTMLElement): string | null =>
    host.querySelector('[role="status"]')?.textContent ?? null;

  const clickExport = async (host: HTMLElement): Promise<void> => {
    const button = host.querySelector('[aria-label="Export settings"]');
    if (!button) throw new Error("No export button.");
    await click(button);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const clickImport = async (host: HTMLElement): Promise<void> => {
    const button = host.querySelector('[aria-label="Import settings"]');
    if (!button) throw new Error("No import button.");
    await click(button);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("says so when the settings file cannot be written", async () => {
    vi.mocked(saveFilePath).mockResolvedValue("/tmp/settings.json");
    vi.mocked(writeTextFileNative).mockResolvedValue(false);
    const host = await render(<SettingsSaveBar />);

    await clickExport(host);

    expect(statusOf(host)).toMatch(/export failed/i);
  });

  it("stays quiet when the user dismisses the save dialog", async () => {
    vi.mocked(saveFilePath).mockResolvedValue(null);
    const host = await render(<SettingsSaveBar />);

    await clickExport(host);

    expect(statusOf(host)).toBeNull();
  });

  it("says so when the chosen settings file cannot be read", async () => {
    vi.mocked(pickFilePath).mockResolvedValue("/tmp/settings.json");
    vi.mocked(readTextFileNative).mockResolvedValue(null);
    const host = await render(<SettingsSaveBar />);

    await clickImport(host);

    expect(statusOf(host)).toMatch(/import failed/i);
  });

  it("stays quiet when the user dismisses the open dialog", async () => {
    vi.mocked(pickFilePath).mockResolvedValue(null);
    const host = await render(<SettingsSaveBar />);

    await clickImport(host);

    expect(statusOf(host)).toBeNull();
  });
});
