// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Theme import/export logic tests.
 *
 * The native dialog/fs modules are mocked via `vi.mock` so tests can control
 * the file paths and contents returned by `saveFilePath`, `pickFilePath`,
 * `writeTextFileNative`, and `readTextFileNative`. The DOM-reading helpers
 * (`readCurrentTokenValues`, `readCurrentThemeBase`) read from
 * `document.documentElement` and `getComputedStyle`, so tests stub
 * `getComputedStyle` and set the `data-thinkbrain-theme` attribute directly to
 * control the export payload. The real module-scoped `useSettingsStore`
 * singleton is seeded directly via `setState`.
 */

// Mock the native dialogs module so we can control save/open dialog results.
vi.mock("../native/dialogs", () => ({
  saveFilePath: vi.fn<(title: string, defaultName: string) => Promise<string | null>>(),
  pickFilePath: vi.fn<
    (title?: string, extensions?: readonly string[]) => Promise<string | null>
  >()
}));

// Mock the native fs module so we can control read/write results.
vi.mock("../native/fs", () => ({
  writeTextFileNative: vi.fn<(path: string, contents: string) => Promise<boolean>>(),
  readTextFileNative: vi.fn<(path: string) => Promise<string | null>>()
}));

// Import the mocked functions AFTER vi.mock so we get the mock implementations.
vi.mock("./themeAdapter", () => ({
  readThemeFile: vi.fn<(path: string) => Promise<string | null>>()
}));

import { readThemeFile } from "./themeAdapter";
import { saveFilePath, pickFilePath } from "../native/dialogs";
import { writeTextFileNative, readTextFileNative } from "../native/fs";
import {
  buildThemeExport,
  buildThemeExportPayload,
  writeThemeExportFile,
  importTheme,
  readCurrentTokenValues,
  readCurrentThemeBase
} from "./themeImportExport";
import { useSettingsStore } from "./settingsStore";
import { seedSettingsStore } from "./settingsTestHelpers";

/** A small representative token map used by export tests. */
const MOCK_TOKENS: Record<string, string> = {
  "--tn-color-background": "#ffffff",
  "--tn-color-foreground": "#1a1a1a",
  "--tn-color-primary": "#0066cc"
};

/**
 * Stub for `window.getComputedStyle` that returns a fake CSSStyleDeclaration
 * supporting only `getPropertyValue(token)` (the API the module uses). Tokens
 * not in the provided map resolve to "".
 */
function stubGetComputedStyle(tokens: Record<string, string>): void {
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
    return {
      getPropertyValue: (name: string): string => tokens[name] ?? ""
    } as unknown as CSSStyleDeclaration;
  });
}

beforeEach(() => {
  // Reset the singleton store to a clean, loaded state before each test.
  seedSettingsStore();

  // Reset mock call counts and default implementations.
  vi.mocked(saveFilePath).mockReset();
  vi.mocked(pickFilePath).mockReset();
  vi.mocked(writeTextFileNative).mockReset();
  vi.mocked(readTextFileNative).mockReset();

  // Default DOM state: light theme with the mock tokens.
  document.documentElement.dataset.thinkbrainTheme = "light";
  stubGetComputedStyle(MOCK_TOKENS);
});

afterEach(() => {
  vi.restoreAllMocks();
  // Remove any stubbed globals (e.g. matchMedia) added during the test.
  vi.unstubAllGlobals();
  // Clean up the dataset attribute so it doesn't leak between tests.
  delete document.documentElement.dataset.thinkbrainTheme;
});

describe("readCurrentThemeBase", () => {
  /**
   * Stub `window.matchMedia` so the system→OS-resolution branch of
   * `readCurrentThemeBase` can be exercised deterministically. Only the
   * `matches` field is consulted by the implementation.
   */
  function stubMatchMedia(matches: boolean): void {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches }));
  }

  it("returns 'dark' when the data-thinkbrain-theme attribute is 'dark'", () => {
    document.documentElement.dataset.thinkbrainTheme = "dark";
    expect(readCurrentThemeBase()).toBe("dark");
  });

  it("returns 'light' when the data-thinkbrain-theme attribute is 'light'", () => {
    document.documentElement.dataset.thinkbrainTheme = "light";
    expect(readCurrentThemeBase()).toBe("light");
  });

  it("returns 'dark' for 'system' when OS prefers dark", () => {
    document.documentElement.dataset.thinkbrainTheme = "system";
    stubMatchMedia(true);
    expect(readCurrentThemeBase()).toBe("dark");
  });

  it("returns 'light' for 'system' when OS prefers light", () => {
    document.documentElement.dataset.thinkbrainTheme = "system";
    stubMatchMedia(false);
    expect(readCurrentThemeBase()).toBe("light");
  });

  it("defaults to 'light' when the attribute is missing", () => {
    delete document.documentElement.dataset.thinkbrainTheme;
    stubMatchMedia(false);
    expect(readCurrentThemeBase()).toBe("light");
  });
});

describe("readCurrentTokenValues", () => {
  it("reads each known token via getComputedStyle and trims values", () => {
    stubGetComputedStyle({
      "--tn-color-background": "  #ffffff  ",
      "--tn-color-foreground": "#1a1a1a"
    });

    const values = readCurrentTokenValues();

    // Trimmed values are returned; tokens not set resolve to "" and are skipped.
    expect(values["--tn-color-background"]).toBe("#ffffff");
    expect(values["--tn-color-foreground"]).toBe("#1a1a1a");
  });

  it("skips tokens whose computed value is empty", () => {
    stubGetComputedStyle({ "--tn-color-background": "#ffffff" });

    const values = readCurrentTokenValues();

    // Only the populated token is present.
    expect(values["--tn-color-background"]).toBe("#ffffff");
    expect("--tn-color-foreground" in values).toBe(false);
  });
});

describe("buildThemeExportPayload", () => {
  it("produces valid JSON with name, base, version, and tokens", () => {
    const { json } = buildThemeExportPayload();
    const parsed = JSON.parse(json) as {
      name: string;
      base: string;
      version: number;
      tokens: Record<string, string>;
    };

    expect(parsed.name).toBe("Exported Theme");
    expect(parsed.base).toBe("light");
    expect(parsed.version).toBe(1);
    expect(parsed.tokens).toEqual(MOCK_TOKENS);
  });

  it("uses the base from the data-thinkbrain-theme attribute", () => {
    document.documentElement.dataset.thinkbrainTheme = "dark";

    const { json } = buildThemeExportPayload();
    const parsed = JSON.parse(json) as { base: string };

    expect(parsed.base).toBe("dark");
  });

  it("uses the tokens from getComputedStyle", () => {
    const customTokens = { "--tn-color-background": "#000000" };
    stubGetComputedStyle(customTokens);

    const { json } = buildThemeExportPayload();
    const parsed = JSON.parse(json) as { tokens: Record<string, string> };

    expect(parsed.tokens).toEqual(customTokens);
  });

  it("produces pretty-printed JSON with a trailing newline", () => {
    const { json } = buildThemeExportPayload();
    // Pretty-printed JSON has a newline + 2-space indentation on the first key.
    expect(json).toContain('\n  "name"');
    expect(json.endsWith("\n")).toBe(true);
  });
});

describe("writeThemeExportFile", () => {
  it("writes the file when the user selects a path", async () => {
    vi.mocked(saveFilePath).mockResolvedValue("/tmp/theme.tbtheme.json");
    vi.mocked(writeTextFileNative).mockResolvedValue(true);

    const result = await writeThemeExportFile('{"name":"x"}');

    expect(result).toBe(true);
    expect(saveFilePath).toHaveBeenCalledWith(
      "Export theme",
      "theme.tbtheme.json"
    );
    expect(writeTextFileNative).toHaveBeenCalledWith(
      "/tmp/theme.tbtheme.json",
      '{"name":"x"}'
    );
  });

  it("returns false when the user cancels the save dialog", async () => {
    vi.mocked(saveFilePath).mockResolvedValue(null);

    const result = await writeThemeExportFile('{"name":"x"}');

    expect(result).toBe(false);
    expect(writeTextFileNative).not.toHaveBeenCalled();
  });

  it("throws when the write fails (fail-loud)", async () => {
    vi.mocked(saveFilePath).mockResolvedValue("/tmp/theme.tbtheme.json");
    vi.mocked(writeTextFileNative).mockResolvedValue(false);

    // Write failures now throw instead of returning false, so the caller can
    // surface a destructive status message. Cancel (above) still returns false.
    await expect(writeThemeExportFile('{"name":"x"}')).rejects.toThrow();
  });
});

describe("importTheme", () => {
  it("stages appearance.themeFile when parsing succeeds and returns the theme name", async () => {
    const themeJson = JSON.stringify({
      name: "My Custom Theme",
      base: "dark",
      version: 1,
      tokens: { "--tn-color-background": "#000000" }
    });

    vi.mocked(pickFilePath).mockResolvedValue("/tmp/my-theme.tbtheme.json");
    vi.mocked(readTextFileNative).mockResolvedValue(themeJson);

    // Spy on stageChange so we can assert it was called with the path.
    const stageChangeSpy = vi.fn((key: string, value: unknown) => {
      useSettingsStore.setState((s) => {
        const staged = { ...s.stagedChanges, [key]: value };
        return {
          stagedChanges: staged,
          isDirty: true,
          dirtyCount: Object.keys(staged).length
        };
      });
    });
    useSettingsStore.setState({ stageChange: stageChangeSpy });

    const result = await importTheme();

    expect(result).not.toBeNull();
    expect(result!.themeName).toBe("My Custom Theme");
    expect(result!.diagnostics).toHaveLength(0);

    // The open dialog should be filtered to `.tbtheme.json` files.
    expect(pickFilePath).toHaveBeenCalledWith("Import theme", ["tbtheme.json"]);

    // The file path should be staged under appearance.themeFile.
    expect(stageChangeSpy).toHaveBeenCalledWith(
      "appearance.themeFile",
      "/tmp/my-theme.tbtheme.json"
    );
  });

  it("returns diagnostics and does not stage when parsing fails", async () => {
    // Missing required `name` field — parseThemeFile returns theme: null with a
    // name.missing error diagnostic.
    const badJson = JSON.stringify({ base: "dark", version: 1, tokens: {} });

    vi.mocked(pickFilePath).mockResolvedValue("/tmp/bad.tbtheme.json");
    vi.mocked(readTextFileNative).mockResolvedValue(badJson);

    const stageChangeSpy = vi.fn();
    useSettingsStore.setState({ stageChange: stageChangeSpy });

    const result = await importTheme();

    expect(result).not.toBeNull();
    expect(result!.themeName).toBeNull();
    // At least one error diagnostic should be present.
    expect(result!.diagnostics.length).toBeGreaterThan(0);
    const hasError = result!.diagnostics.some((d) => d.severity === "error");
    expect(hasError).toBe(true);

    // Nothing should be staged when parsing fails.
    expect(stageChangeSpy).not.toHaveBeenCalled();
  });

  it("returns null when the user cancels the open dialog", async () => {
    vi.mocked(pickFilePath).mockResolvedValue(null);

    const result = await importTheme();

    expect(result).toBeNull();
    expect(readTextFileNative).not.toHaveBeenCalled();
  });

  it("throws when the file cannot be read (fail-loud)", async () => {
    vi.mocked(pickFilePath).mockResolvedValue("/tmp/missing.tbtheme.json");
    vi.mocked(readTextFileNative).mockResolvedValue(null);

    const stageChangeSpy = vi.fn();
    useSettingsStore.setState({ stageChange: stageChangeSpy });

    // Read failures now throw instead of returning null, so the caller can
    // surface a destructive status message. Cancel (above) still returns null.
    await expect(importTheme()).rejects.toThrow();
    expect(stageChangeSpy).not.toHaveBeenCalled();
  });

  it("returns diagnostics for malformed JSON (fail-loud)", async () => {
    vi.mocked(pickFilePath).mockResolvedValue("/tmp/broken.tbtheme.json");
    vi.mocked(readTextFileNative).mockResolvedValue("not valid json {{{");

    const stageChangeSpy = vi.fn();
    useSettingsStore.setState({ stageChange: stageChangeSpy });

    const result = await importTheme();

    // parseThemeFile returns a structured result with diagnostics for bad JSON
    // (it does not throw), so importTheme returns the diagnostics rather than
    // null. null is reserved for cancel; read failures throw.
    expect(result).not.toBeNull();
    expect(result!.themeName).toBeNull();
    expect(result!.diagnostics.length).toBeGreaterThan(0);
    expect(result!.diagnostics[0]!.code).toBe("theme.invalid_json");
    expect(stageChangeSpy).not.toHaveBeenCalled();
  });

  it("passes through warnings on a successful parse with unknown tokens", async () => {
    // A theme with an unknown token key produces a warning diagnostic but the
    // theme still parses (theme is non-null). importTheme should stage the path
    // AND return the warning diagnostics.
    const themeJson = JSON.stringify({
      name: "Warned Theme",
      base: "light",
      version: 1,
      tokens: { "--tn-color-unknown-token": "#ff0000" }
    });

    vi.mocked(pickFilePath).mockResolvedValue("/tmp/warned.tbtheme.json");
    vi.mocked(readTextFileNative).mockResolvedValue(themeJson);

    const stageChangeSpy = vi.fn();
    useSettingsStore.setState({ stageChange: stageChangeSpy });

    const result = await importTheme();

    expect(result).not.toBeNull();
    expect(result!.themeName).toBe("Warned Theme");
    // The unknown token produces a warning diagnostic.
    expect(result!.diagnostics.length).toBeGreaterThan(0);
    const hasWarning = result!.diagnostics.some(
      (d) => d.severity === "warning"
    );
    expect(hasWarning).toBe(true);

    // Path is still staged because the theme parsed successfully.
    expect(stageChangeSpy).toHaveBeenCalledWith(
      "appearance.themeFile",
      "/tmp/warned.tbtheme.json"
    );
  });
});

/**
 * `getComputedStyle` returns resolved values, so a snapshot export flattens
 * `var()` aliases and `color-mix()` formulas to the colours they happen to
 * produce. When the user is running a theme file, that file is already a
 * faithful copy of what they see — exporting its bytes round-trips, and
 * exporting a snapshot of it quietly does not.
 */
describe("exporting while a theme file is active", () => {
  const THEME_SOURCE = JSON.stringify(
    {
      name: "Hand Authored",
      base: "dark",
      version: 1,
      tokens: { "--tn-color-primary": "var(--tn-color-accent)" }
    },
    null,
    2
  );

  it("hands back the file's own bytes rather than a flattened snapshot", async () => {
    vi.mocked(readThemeFile).mockResolvedValue(THEME_SOURCE);
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.themeFile": "/tmp/hand.tbtheme.json" },
      stagedChanges: {}
    });

    const { json } = await buildThemeExport();

    expect(json).toBe(THEME_SOURCE);
    expect(json).toContain("var(--tn-color-accent)");
  });

  it("snapshots the document when no theme file is active", async () => {
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.themeFile": null },
      stagedChanges: {}
    });

    const { json } = await buildThemeExport();

    expect(JSON.parse(json)).toMatchObject({ name: "Exported Theme" });
  });

  /** An unreadable file is no reason to refuse the export outright. */
  it("falls back to a snapshot when the file cannot be read", async () => {
    vi.mocked(readThemeFile).mockResolvedValue(null);
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.themeFile": "/tmp/gone.tbtheme.json" },
      stagedChanges: {}
    });

    const { json } = await buildThemeExport();

    expect(JSON.parse(json)).toMatchObject({ name: "Exported Theme" });
  });

  /** A file that no longer parses would export a broken theme verbatim. */
  it("falls back to a snapshot when the file no longer parses", async () => {
    vi.mocked(readThemeFile).mockResolvedValue("not json {{{");
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.themeFile": "/tmp/broken.tbtheme.json" },
      stagedChanges: {}
    });

    const { json } = await buildThemeExport();

    expect(JSON.parse(json)).toMatchObject({ name: "Exported Theme" });
  });
});
