// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsContent } from "./SettingsContent";
import { useSettingsStore } from "./settingsStore";

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
  // Reset the singleton store to a clean, loaded state before every test.
  // Replace resetSection with a spy so the click test can assert its argument.
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
 * Renders a component into a fresh container and flushes React effects.
 *
 * @param component The React element under test.
 * @returns The container containing the rendered component.
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

/** Dispatches a click and flushes resulting React updates. */
async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

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

    // Clearing diagnostics simulates a successful re-save or staging a fix.
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
