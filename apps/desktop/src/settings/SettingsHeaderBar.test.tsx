// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsHeaderBar } from "./SettingsHeaderBar";
import { pickFilePath, saveFilePath } from "../native/dialogs";
import { readTextFileNative, writeTextFileNative } from "../native/fs";
import { useSettingsStore } from "./settingsStore";
import {
  createSettingsTestHarness,
  flushPromises,
  seedSettingsStore
} from "./settingsTestHelpers";

/**
 * SettingsHeaderBar action, breadcrumb, and import/export tests.
 *
 * The real module-scoped store is seeded directly before each test. Native
 * dialogs and filesystem calls are mocked because Tauri is unavailable here.
 * Rendering uses the project's createRoot/act convention without a testing
 * library dependency.
 */

vi.mock("../native/dialogs", () => ({
  saveFilePath: vi.fn<(title: string, defaultName: string) => Promise<string | null>>(),
  pickFilePath: vi.fn<(title?: string) => Promise<string | null>>()
}));
vi.mock("../native/fs", () => ({
  writeTextFileNative: vi.fn<(path: string, contents: string) => Promise<boolean>>(),
  readTextFileNative: vi.fn<(path: string) => Promise<string | null>>()
}));

const harness = createSettingsTestHarness();

beforeEach(() => {
  vi.clearAllMocks();
  seedSettingsStore({
    saveSettings: vi.fn(async () => ({ success: true, diagnostics: [] })),
    resetStaged: vi.fn(() => undefined),
    resetSection: vi.fn(() => undefined)
  });
});

afterEach(async () => {
  await harness.unmount();
});

describe("SettingsHeaderBar", () => {
  it("renders Export, Import, Reset, and Save buttons", async () => {
    const el = await harness.render(<SettingsHeaderBar />);
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));

    expect(buttons).toHaveLength(4);
    expect(buttons[0]!.disabled).toBe(false);
    expect(buttons[1]!.disabled).toBe(false);
    expect(buttons[2]!.disabled).toBe(true);
    expect(buttons[3]!.disabled).toBe(true);
    expect(buttons[3]!.textContent).toBe("Save");
  });

  it("enables Reset and Save when dirty and shows dirty count", async () => {
    useSettingsStore.setState({ isDirty: true, dirtyCount: 3 });
    const el = await harness.render(<SettingsHeaderBar />);
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));

    expect(buttons[2]!.disabled).toBe(false);
    expect(buttons[3]!.disabled).toBe(false);
    expect(buttons[3]!.textContent).toBe("Save (3)");
  });

  it("clicking Save calls saveSettings from the store", async () => {
    useSettingsStore.setState({ isDirty: true, dirtyCount: 1 });
    const el = await harness.render(<SettingsHeaderBar />);

    await harness.click(el.querySelectorAll("button")[3]!);

    expect(useSettingsStore.getState().saveSettings).toHaveBeenCalledTimes(1);
  });

  it("clicking Reset calls resetStaged from the store", async () => {
    useSettingsStore.setState({ isDirty: true, dirtyCount: 1 });
    const el = await harness.render(<SettingsHeaderBar />);

    await harness.click(el.querySelectorAll("button")[2]!);

    expect(useSettingsStore.getState().resetStaged).toHaveBeenCalledTimes(1);
  });

  it("displays saveError in the header when set", async () => {
    useSettingsStore.setState({
      isDirty: true,
      dirtyCount: 1,
      saveError: "Failed to save settings: disk full"
    });
    const el = await harness.render(<SettingsHeaderBar />);

    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("disk full");
  });

  it("does not display saveError when null", async () => {
    const el = await harness.render(<SettingsHeaderBar />);

    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("SettingsHeaderBar accessibility and autosave", () => {
  it("gives Export and Import buttons titles and aria-labels", async () => {
    const el = await harness.render(<SettingsHeaderBar />);

    for (const label of ["Export settings", "Import settings"]) {
      const button = el.querySelector<HTMLButtonElement>(`button[title="${label}"]`);
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-label")).toBe(label);
    }
  });

  it("hides Save and Reset and shows Autosave enabled when autosave is on", async () => {
    seedSettingsStore({
      appValues: { "settings.autosave": true },
      isDirty: true,
      dirtyCount: 1
    });
    const el = await harness.render(<SettingsHeaderBar />);

    expect(el.querySelector('[aria-label="Export settings"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Import settings"]')).not.toBeNull();
    expect(el.textContent).toContain("Autosave enabled");
    expect(el.querySelector('[aria-label="Reset all unsaved settings"]')).toBeNull();
    expect(el.querySelector("button:not([aria-label])")).toBeNull();
  });

  it("ticking Advanced stages the setting that reveals the hidden rows", async () => {
    const el = await harness.render(<SettingsHeaderBar />);
    const toggle = el.querySelector<HTMLInputElement>('[aria-label="Show advanced settings"]')!;

    expect(toggle.checked).toBe(false);
    await harness.click(toggle);

    expect(useSettingsStore.getState().stagedChanges["settings.showAdvanced"]).toBe(true);
  });

  it("shows the Advanced box ticked from a staged value, before any save", async () => {
    // The rows it reveals read the same staged value, so a toggle that only
    // caught up after a save would disagree with the list underneath it.
    useSettingsStore.setState({
      stagedChanges: { "settings.showAdvanced": true },
      isDirty: true,
      dirtyCount: 1
    });
    const el = await harness.render(<SettingsHeaderBar />);

    expect(
      el.querySelector<HTMLInputElement>('[aria-label="Show advanced settings"]')!.checked
    ).toBe(true);
  });

  it("honors staged autosave over the app value", async () => {
    useSettingsStore.setState({
      stagedChanges: { "settings.autosave": true },
      isDirty: true,
      dirtyCount: 1
    });
    const el = await harness.render(<SettingsHeaderBar />);

    expect(el.textContent).toContain("Autosave enabled");
    expect(el.querySelector('[aria-label="Reset all unsaved settings"]')).toBeNull();
  });
});

describe("SettingsHeaderBar breadcrumbs", () => {
  it("renders fallback breadcrumb 'Settings' when no active section", async () => {
    const el = await harness.render(<SettingsHeaderBar />);
    const breadcrumb = el.querySelector('[aria-label="Settings location"]');

    expect(breadcrumb?.textContent).toBe("Settings");
  });

  it("renders active section breadcrumb path", async () => {
    useSettingsStore.setState({ activeSection: "editor.display" });
    const el = await harness.render(<SettingsHeaderBar />);
    const breadcrumb = el.querySelector('[aria-label="Settings location"]');

    expect(breadcrumb?.textContent).toContain("Editor");
    expect(breadcrumb?.textContent).toContain("Display");
    expect(breadcrumb?.querySelector('[aria-hidden="true"]')?.textContent).toBe("›");
  });
});

describe("SettingsHeaderBar saving state", () => {
  it("shows Saving… and prevents duplicate saves while pending", async () => {
    let resolveSave!: (value: { success: true; diagnostics: [] }) => void;
    const savePromise = new Promise<{ success: true; diagnostics: [] }>((resolve) => {
      resolveSave = resolve;
    });
    const saveSettings = vi.fn(() => savePromise);
    useSettingsStore.setState({ isDirty: true, dirtyCount: 1, saveSettings });
    const el = await harness.render(<SettingsHeaderBar />);
    const saveButton = el.querySelectorAll<HTMLButtonElement>("button")[3]!;

    await harness.click(saveButton);
    expect(saveButton.textContent).toBe("Saving…");
    expect(saveButton.disabled).toBe(true);
    expect(el.querySelector('[aria-label="Reset all unsaved settings"]')?.getAttribute("disabled")).toBe(
      ""
    );

    await harness.click(saveButton);
    expect(saveSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave({ success: true, diagnostics: [] });
      await savePromise;
    });
    expect(saveButton.textContent).toBe("Save (1)");
    expect(saveButton.disabled).toBe(false);
  });
});

/**
 * Import/export each report success, cancellation, and file-operation failure
 * distinctly so a failed action never looks like a dismissed dialog.
 */
describe("SettingsHeaderBar export/import outcomes", () => {
  const statusOf = (host: HTMLElement): string | null =>
    host.querySelector('[role="status"]')?.textContent ?? null;

  const clickExport = async (host: HTMLElement): Promise<void> => {
    await harness.click(host.querySelector('[aria-label="Export settings"]')!);
    await flushPromises();
  };

  const clickImport = async (host: HTMLElement): Promise<void> => {
    await harness.click(host.querySelector('[aria-label="Import settings"]')!);
    await flushPromises();
  };

  it("says so when the settings file cannot be written", async () => {
    vi.mocked(saveFilePath).mockResolvedValue("/tmp/settings.json");
    vi.mocked(writeTextFileNative).mockResolvedValue(false);
    const host = await harness.render(<SettingsHeaderBar />);

    await clickExport(host);

    expect(statusOf(host)).toMatch(/export failed/i);
  });

  it("stays quiet when the user dismisses the save dialog", async () => {
    vi.mocked(saveFilePath).mockResolvedValue(null);
    const host = await harness.render(<SettingsHeaderBar />);

    await clickExport(host);

    expect(statusOf(host)).toBeNull();
  });

  it("says so when the chosen settings file cannot be read", async () => {
    vi.mocked(pickFilePath).mockResolvedValue("/tmp/settings.json");
    vi.mocked(readTextFileNative).mockResolvedValue(null);
    const host = await harness.render(<SettingsHeaderBar />);

    await clickImport(host);

    expect(statusOf(host)).toMatch(/import failed/i);
  });

  it("stays quiet when the user dismisses the open dialog", async () => {
    vi.mocked(pickFilePath).mockResolvedValue(null);
    const host = await harness.render(<SettingsHeaderBar />);

    await clickImport(host);

    expect(statusOf(host)).toBeNull();
  });
});
