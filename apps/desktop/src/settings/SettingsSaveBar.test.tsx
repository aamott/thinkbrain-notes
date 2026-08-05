// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsSaveBar } from "./SettingsSaveBar";
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
 * Rendering follows the codebase convention: `createRoot` + `act` + DOM
 * queries (no @testing-library/react dependency is available).
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Default app values seeded into the store for most tests. */
const SEEDED_APP_VALUES: Record<string, unknown> = {
  "appearance.theme": "system",
  "editor.fontSize": 16,
  "editor.lineWrapping": true
};

beforeEach(() => {
  // Reset the singleton store to a clean, loaded state before each test.
  // Replace saveSettings/resetStaged with spies so we can assert calls and
  // control the outcome without hitting the native gateway.
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
    resetStaged: vi.fn(() => undefined)
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
  it("disables Save and Reset buttons when not dirty", async () => {
    const el = await render(<SettingsSaveBar />);

    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons).toHaveLength(2);

    const resetBtn = buttons[0]!;
    const saveBtn = buttons[1]!;

    expect(resetBtn.disabled).toBe(true);
    expect(saveBtn.disabled).toBe(true);
    expect(saveBtn.textContent).toBe("Save");
  });

  it("enables buttons and shows dirty count when dirty", async () => {
    useSettingsStore.setState({ isDirty: true, dirtyCount: 3 });
    const el = await render(<SettingsSaveBar />);

    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
    const saveBtn = buttons[1]!;

    expect(saveBtn.disabled).toBe(false);
    expect(saveBtn.textContent).toBe("Save (3)");
    expect(buttons[0]!.disabled).toBe(false);
  });

  it("clicking Save calls saveSettings from the store", async () => {
    useSettingsStore.setState({ isDirty: true, dirtyCount: 1 });
    const el = await render(<SettingsSaveBar />);

    const saveBtn = Array.from(el.querySelectorAll<HTMLButtonElement>("button"))[1]!;
    await click(saveBtn);

    const { saveSettings } = useSettingsStore.getState();
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("clicking Reset calls resetStaged from the store", async () => {
    useSettingsStore.setState({ isDirty: true, dirtyCount: 1 });
    const el = await render(<SettingsSaveBar />);

    const resetBtn = Array.from(el.querySelectorAll<HTMLButtonElement>("button"))[0]!;
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
