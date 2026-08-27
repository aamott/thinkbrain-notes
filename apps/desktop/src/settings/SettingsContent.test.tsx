// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsContent } from "./SettingsContent";
import { createScrollSpyHarness, intersectSection } from "./scrollSpyTestUtils";
import { requestSettingHighlight } from "./settingHighlight";
import { useSettingsStore } from "./settingsStore";
import {
  createSettingsTestHarness,
  seedSettingsStore
} from "./settingsTestHelpers";

/**
 * SettingsContent tests for inline validation diagnostics and per-section
 * reset behavior.
 *
 * The tests use the real module-scoped `useSettingsStore` singleton and seed
 * state directly before each test. Native modules are mocked to keep this
 * component test isolated from Tauri's unavailable Node gateway.
 */

// Mock the native dialogs/fs modules so rendering theme-related controls does
// not attempt to call Tauri when these tests run under happy-dom.
vi.mock("../native/dialogs", () => ({
  saveFilePath: vi.fn<(title: string, defaultName: string) => Promise<string | null>>(),
  pickFilePath: vi.fn<(title?: string) => Promise<string | null>>()
}));
vi.mock("../native/fs", () => ({
  writeTextFileNative: vi.fn<(path: string, contents: string) => Promise<boolean>>(),
  readTextFileNative: vi.fn<(path: string) => Promise<string | null>>()
}));

const harness = createSettingsTestHarness();
const scrollSpy = createScrollSpyHarness();

beforeEach(() => {
  scrollSpy.install();

  // Reset the singleton store to a clean, loaded state before every test.
  // Replace resetSection with a spy so the click test can assert its argument.
  seedSettingsStore({
    saveSettings: vi.fn(async () => ({ success: true, diagnostics: [] })),
    resetStaged: vi.fn(() => undefined),
    resetSection: vi.fn(() => undefined)
  });
});

afterEach(async () => {
  await harness.unmount();
  vi.useRealTimers();
  scrollSpy.restore();
});

describe("SettingsContent single-page layout", () => {
  it("renders every app section in registry order", async () => {
    const el = await harness.render(<SettingsContent />);
    const ids = Array.from(el.querySelectorAll("section"), (section) => section.id);

    expect(ids).toContain("settings-section-app:appearance.theme");
    expect(ids).toContain("settings-section-app:editor.display");
    expect(ids).toContain("settings-section-app:settings.general");
    expect(ids.indexOf("settings-section-app:appearance.theme")).toBeLessThan(
      ids.indexOf("settings-section-app:editor.display")
    );
  });

  it("appends workspace sections only when a workspace is open", async () => {
    useSettingsStore.setState({ workspaceValues: { "sync.destination": "" } });
    const el = await harness.render(<SettingsContent />);
    const ids = Array.from(el.querySelectorAll("section"), (section) => section.id);

    expect(ids).toContain("settings-section-workspace:sync.destination");
    expect(ids.indexOf("settings-section-workspace:sync.destination")).toBeGreaterThan(
      ids.indexOf("settings-section-app:sync.history")
    );
  });

  it("updates activeSection from scroll position", async () => {
    const el = await harness.render(<SettingsContent />);
    const display = el.querySelector("#settings-section-app\\:editor\\.display")!;

    await intersectSection(scrollSpy, display);
    expect(useSettingsStore.getState().activeSection).toBe("app:editor.display");
  });

  it("scrolls to and highlights a setting requested by search", async () => {
    vi.useFakeTimers();
    const el = await harness.render(<SettingsContent />);
    const display = el.querySelector<HTMLElement>("#settings-section-app\\:editor\\.display")!;

    await act(async () => requestSettingHighlight("editor.fontSize"));

    expect(
      el.querySelector('[data-setting-key="editor.fontSize"]')?.getAttribute("data-highlighted")
    ).toBe("true");
    expect(scrollSpy.scrollIntoView.mock.instances).toContain(display);
    expect(scrollSpy.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start"
    });

    await act(async () => vi.advanceTimersByTime(1200));
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
    const el = await harness.render(<SettingsContent />);

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
    const el = await harness.render(<SettingsContent />);

    expect(el.querySelectorAll('[role="alert"]').length).toBe(1);

    // Clearing diagnostics simulates a successful re-save or staging a fix.
    await act(async () => {
      useSettingsStore.setState({ validationDiagnostics: [] });
    });

    expect(el.querySelectorAll('[role="alert"]').length).toBe(0);
  });

  it("renders errors even when their section is not currently active", async () => {
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
    const el = await harness.render(<SettingsContent />);

    // All sections remain mounted, so diagnostics never disappear while scrolling.
    expect(el.querySelectorAll('[role="alert"]').length).toBe(1);
  });
});

describe("SettingsContent per-section reset button", () => {
  it("is disabled without staged changes, enabled with them, and calls resetSection on click", async () => {
    useSettingsStore.setState({ activeSection: "editor.display" });
    const el = await harness.render(<SettingsContent />);

    const resetBtn = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Reset Display to defaults"]'
    )!;
    expect(resetBtn.disabled).toBe(true);

    await act(async () => {
      useSettingsStore.setState({ stagedChanges: { "editor.fontSize": 20 } });
    });
    expect(resetBtn.disabled).toBe(false);

    await harness.click(resetBtn);
    expect(useSettingsStore.getState().resetSection).toHaveBeenCalledWith("editor.display");
  });
});
