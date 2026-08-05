// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToolbar } from "./ThemeSectionControls";
import { useSettingsStore } from "./settingsStore";
import type { ImportThemeResult } from "./themeImportExport";

/**
 * ThemeToolbar component tests.
 *
 * The `./themeImportExport` module is mocked via `vi.mock` so each test controls
 * the resolved/rejected value of `buildThemeExportPayload`, `writeThemeExportFile`,
 * and `importTheme`. The toolbar's status message (`role="status"`) is queried to
 * assert the user-facing feedback for each branch: success, cancel, and failure
 * (the latter now surfaced via thrown errors per the fail-loudly rule).
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

// Import the mocked functions AFTER vi.mock so we get the mock implementations.
import {
  buildThemeExportPayload,
  writeThemeExportFile,
  importTheme
} from "./themeImportExport";

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

  // Reset mock call counts and default implementations.
  vi.mocked(buildThemeExportPayload).mockReset();
  vi.mocked(writeThemeExportFile).mockReset();
  vi.mocked(importTheme).mockReset();

  // Sensible defaults so a test that forgets to set up the export payload still
  // gets a valid JSON string back from buildThemeExportPayload.
  vi.mocked(buildThemeExportPayload).mockReturnValue({ json: '{"name":"x"}' });
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
