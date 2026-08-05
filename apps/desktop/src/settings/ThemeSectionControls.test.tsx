// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemePicker, ThemeToolbar } from "./ThemeSectionControls";
import { useSettingsStore } from "./settingsStore";
import type { ImportThemeResult } from "./themeImportExport";
import type { ThemeEntry } from "./themeAdapter";

/**
 * ThemePicker & ThemeToolbar component tests.
 *
 * The `./themeImportExport` and `./themeAdapter` modules are mocked via
 * `vi.mock` so each test controls the resolved/rejected values. The toolbar's
 * status message (`role="status"`) is queried to assert the user-facing
 * feedback for each branch: success, cancel, and failure (the latter now
 * surfaced via thrown errors per the fail-loudly rule). The picker tests cover
 * the unified base/preset dropdown and its dual staging behavior.
 *
 * Rendering follows the codebase convention: `createRoot` + `act` + DOM queries
 * (no @testing-library/react dependency is available).
 */

// Mock the themeImportExport module so the toolbar never touches the DOM/native
// bridges. Each test customizes the mock implementations as needed.
vi.mock("./themeImportExport", () => ({
  buildThemeExportPayload: vi.fn<() => { json: string }>(),
  writeThemeExportFile: vi.fn<(json: string) => Promise<boolean>>(),
  importTheme: vi.fn<() => Promise<ImportThemeResult | null>>()
}));

// Mock the themeAdapter so the picker's listThemes() call is deterministic and
// never touches the native bridge. Each test customizes the resolved value.
vi.mock("./themeAdapter", () => ({
  listThemes: vi.fn<() => Promise<readonly ThemeEntry[]>>()
}));

// Import the mocked functions AFTER vi.mock so we get the mock implementations.
import {
  buildThemeExportPayload,
  writeThemeExportFile,
  importTheme
} from "./themeImportExport";
import { listThemes } from "./themeAdapter";

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

  // Reset mock call counts and default implementations.
  vi.mocked(buildThemeExportPayload).mockReset();
  vi.mocked(writeThemeExportFile).mockReset();
  vi.mocked(importTheme).mockReset();
  vi.mocked(listThemes).mockReset();

  // Sensible defaults so a test that forgets to set up the export payload still
  // gets a valid JSON string back from buildThemeExportPayload.
  vi.mocked(buildThemeExportPayload).mockReturnValue({ json: '{"name":"x"}' });

  // Default: no preset themes discovered (non-Tauri/test context). Tests that
  // need presets override this with mockResolvedValue([...]).
  vi.mocked(listThemes).mockResolvedValue([]);
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

/** Returns the toolbar's transient status message, or null if none is rendered. */
function getStatus(el: HTMLElement): string | null {
  const node = el.querySelector('[role="status"]');
  return node?.textContent ?? null;
}

/**
 * Changes the unified picker's <select> value and dispatches the change event,
 * flushing React updates. Mirrors how a real user interacts with a dropdown.
 */
async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("ThemePicker", () => {
  it("renders the unified picker with Base and Themes optgroups", async () => {
    vi.mocked(listThemes).mockResolvedValue([
      { name: "Forest Dark", path: "/themes/forest-dark.tbtheme.json" }
    ]);
    const el = await render(<ThemePicker />);

    const select = el.querySelector<HTMLSelectElement>("select#theme-picker-select");
    expect(select).not.toBeNull();

    // Base optgroup with the three base options.
    const baseGroup = el.querySelector<HTMLOptGroupElement>('optgroup[label="Base"]');
    expect(baseGroup).not.toBeNull();
    const baseOptions = baseGroup?.querySelectorAll("option");
    expect(baseOptions?.length).toBe(3);
    expect(Array.from(baseOptions ?? []).map((o) => o.value)).toEqual([
      "system",
      "light",
      "dark"
    ]);

    // Themes optgroup with the discovered preset.
    const themesGroup = el.querySelector<HTMLOptGroupElement>(
      'optgroup[label="Themes"]'
    );
    expect(themesGroup).not.toBeNull();
    const themeOptions = themesGroup?.querySelectorAll("option");
    expect(themeOptions?.length).toBe(1);
    expect(themeOptions?.[0]?.value).toBe("/themes/forest-dark.tbtheme.json");
    expect(themeOptions?.[0]?.textContent).toBe("Forest Dark");
  });

  it("reflects the effective appearance.theme value when no theme file is set", async () => {
    useSettingsStore.setState({
      appValues: { ...SEEDED_APP_VALUES, "appearance.theme": "dark" }
    });
    const el = await render(<ThemePicker />);

    const select = el.querySelector<HTMLSelectElement>("select#theme-picker-select");
    expect(select?.value).toBe("dark");
  });

  it("reflects the themeFile path when a theme file is set", async () => {
    const path = "/themes/forest-dark.tbtheme.json";
    useSettingsStore.setState({
      appValues: { ...SEEDED_APP_VALUES, "appearance.themeFile": path }
    });
    vi.mocked(listThemes).mockResolvedValue([
      { name: "Forest Dark", path }
    ]);
    const el = await render(<ThemePicker />);

    const select = el.querySelector<HTMLSelectElement>("select#theme-picker-select");
    expect(select?.value).toBe(path);
  });

  it("stages appearance.theme and clears themeFile when a base option is selected", async () => {
    // Start with a theme file active.
    useSettingsStore.setState({
      appValues: {
        ...SEEDED_APP_VALUES,
        "appearance.theme": "system",
        "appearance.themeFile": "/themes/forest-dark.tbtheme.json"
      }
    });
    vi.mocked(listThemes).mockResolvedValue([
      { name: "Forest Dark", path: "/themes/forest-dark.tbtheme.json" }
    ]);
    const el = await render(<ThemePicker />);

    const select = el.querySelector<HTMLSelectElement>("select#theme-picker-select")!;
    await changeSelect(select, "dark");

    const staged = useSettingsStore.getState().stagedChanges;
    expect(staged["appearance.theme"]).toBe("dark");
    expect(staged["appearance.themeFile"]).toBeNull();
  });

  it("stages appearance.themeFile and leaves appearance.theme untouched when a preset is selected", async () => {
    const path = "/themes/forest-dark.tbtheme.json";
    useSettingsStore.setState({
      appValues: { ...SEEDED_APP_VALUES, "appearance.theme": "light" }
    });
    vi.mocked(listThemes).mockResolvedValue([
      { name: "Forest Dark", path }
    ]);
    const el = await render(<ThemePicker />);

    const select = el.querySelector<HTMLSelectElement>("select#theme-picker-select")!;
    await changeSelect(select, path);

    const staged = useSettingsStore.getState().stagedChanges;
    expect(staged["appearance.themeFile"]).toBe(path);
    // appearance.theme should NOT be staged (left at its existing value).
    expect("appearance.theme" in staged).toBe(false);
  });

  it("renders a load error when listThemes rejects", async () => {
    vi.mocked(listThemes).mockRejectedValue(new Error("boom"));
    const el = await render(<ThemePicker />);

    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("boom");
  });
});

describe("ThemeToolbar", () => {
  it("renders Export and Import buttons", async () => {
    const el = await render(<ThemeToolbar />);

    const exportBtn = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Export Theme"]'
    );
    const importBtn = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Import Theme"]'
    );
    expect(exportBtn).not.toBeNull();
    expect(importBtn).not.toBeNull();
  });

  describe("handleExport", () => {
    it("shows 'Theme exported.' on a successful write", async () => {
      vi.mocked(writeThemeExportFile).mockResolvedValue(true);
      const el = await render(<ThemeToolbar />);

      const exportBtn = el.querySelector<HTMLButtonElement>(
        'button[aria-label="Export Theme"]'
      )!;
      await click(exportBtn);

      expect(writeThemeExportFile).toHaveBeenCalledWith('{"name":"x"}');
      expect(getStatus(el)).toBe("Theme exported.");
    });

    it("shows no status message when the user cancels the save dialog", async () => {
      // Cancel resolves false — a non-event the toolbar ignores.
      vi.mocked(writeThemeExportFile).mockResolvedValue(false);
      const el = await render(<ThemeToolbar />);

      const exportBtn = el.querySelector<HTMLButtonElement>(
        'button[aria-label="Export Theme"]'
      )!;
      await click(exportBtn);

      expect(getStatus(el)).toBeNull();
    });

    it("shows an 'Export failed' status message when the write throws", async () => {
      // Write failures now throw (fail-loudly) and are surfaced via .catch().
      vi.mocked(writeThemeExportFile).mockRejectedValue(
        new Error("disk full")
      );
      const el = await render(<ThemeToolbar />);

      const exportBtn = el.querySelector<HTMLButtonElement>(
        'button[aria-label="Export Theme"]'
      )!;
      await click(exportBtn);

      const status = getStatus(el);
      expect(status).not.toBeNull();
      expect(status).toContain("Export failed");
    });
  });

  describe("handleImport", () => {
    it("shows the imported theme name on a clean parse", async () => {
      vi.mocked(importTheme).mockResolvedValue({
        themeName: "Test",
        diagnostics: []
      });
      const el = await render(<ThemeToolbar />);

      const importBtn = el.querySelector<HTMLButtonElement>(
        'button[aria-label="Import Theme"]'
      )!;
      await click(importBtn);

      const status = getStatus(el);
      expect(status).not.toBeNull();
      expect(status).toContain("Test");
    });

    it("includes a warning count when the parse succeeds with warnings", async () => {
      vi.mocked(importTheme).mockResolvedValue({
        themeName: "Test",
        diagnostics: [{ code: "x", message: "bad", severity: "warning" }]
      });
      const el = await render(<ThemeToolbar />);

      const importBtn = el.querySelector<HTMLButtonElement>(
        'button[aria-label="Import Theme"]'
      )!;
      await click(importBtn);

      const status = getStatus(el);
      expect(status).not.toBeNull();
      expect(status).toContain("Test");
      expect(status).toContain("warning");
    });

    it("surfaces the first error diagnostic when parsing fails", async () => {
      vi.mocked(importTheme).mockResolvedValue({
        themeName: null,
        diagnostics: [
          { code: "name.missing", message: "name is required", severity: "error" }
        ]
      });
      const el = await render(<ThemeToolbar />);

      const importBtn = el.querySelector<HTMLButtonElement>(
        'button[aria-label="Import Theme"]'
      )!;
      await click(importBtn);

      const status = getStatus(el);
      expect(status).not.toBeNull();
      expect(status).toContain("Import failed");
      expect(status).toContain("name is required");
    });

    it("shows a generic invalid-file message when parsing fails without an error diagnostic", async () => {
      // Defensive branch: parse failed (themeName null) but no error-severity
      // diagnostic was produced. The toolbar falls back to a generic message.
      vi.mocked(importTheme).mockResolvedValue({
        themeName: null,
        diagnostics: []
      });
      const el = await render(<ThemeToolbar />);

      const importBtn = el.querySelector<HTMLButtonElement>(
        'button[aria-label="Import Theme"]'
      )!;
      await click(importBtn);

      const status = getStatus(el);
      expect(status).not.toBeNull();
      expect(status).toContain("Import failed");
      expect(status).toContain("invalid");
    });

    it("shows no status message when the user cancels the open dialog", async () => {
      // Cancel resolves null — a non-event the toolbar ignores.
      vi.mocked(importTheme).mockResolvedValue(null);
      const el = await render(<ThemeToolbar />);

      const importBtn = el.querySelector<HTMLButtonElement>(
        'button[aria-label="Import Theme"]'
      )!;
      await click(importBtn);

      expect(getStatus(el)).toBeNull();
    });

    it("shows an 'Import failed' status message when the read throws", async () => {
      // Read failures now throw (fail-loudly) and are surfaced via .catch().
      vi.mocked(importTheme).mockRejectedValue(new Error("permission denied"));
      const el = await render(<ThemeToolbar />);

      const importBtn = el.querySelector<HTMLButtonElement>(
        'button[aria-label="Import Theme"]'
      )!;
      await click(importBtn);

      const status = getStatus(el);
      expect(status).not.toBeNull();
      expect(status).toContain("Import failed");
    });
  });
});
