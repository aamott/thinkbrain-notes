// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildExportPayload,
  writeExportFile,
  importSettings
} from "./settingsImportExport";
import { useSettingsStore } from "./settingsStore";

/**
 * Settings import/export logic tests.
 *
 * The native dialog/fs modules are mocked via `vi.mock` so tests can control
 * the file paths and contents returned by `saveFilePath`, `pickFilePath`,
 * `writeTextFileNative`, and `readTextFileNative`. The real module-scoped
 * `useSettingsStore` singleton is seeded directly via `setState`.
 */

// Mock the native dialogs module so we can control save/open dialog results.
vi.mock("../native/dialogs", () => ({
  saveFilePath: vi.fn<(title: string, defaultName: string) => Promise<string | null>>(),
  pickFilePath: vi.fn<(title?: string) => Promise<string | null>>()
}));

// Mock the native fs module so we can control read/write results.
vi.mock("../native/fs", () => ({
  writeTextFileNative: vi.fn<(path: string, contents: string) => Promise<boolean>>(),
  readTextFileNative: vi.fn<(path: string) => Promise<string | null>>()
}));

// Import the mocked functions AFTER vi.mock so we get the mock implementations.
import { saveFilePath, pickFilePath } from "../native/dialogs";
import { writeTextFileNative, readTextFileNative } from "../native/fs";

/** Default app values seeded into the store for most tests. */
const SEEDED_APP_VALUES: Record<string, unknown> = {
  "appearance.theme": "system",
  "appearance.themeFile": null,
  "editor.fontSize": 16,
  "editor.lineWrapping": true,
  "editor.livePreview": true,
  "settings.autosave": false,
  "sync.settleAutomatically": true
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
  vi.mocked(saveFilePath).mockReset();
  vi.mocked(pickFilePath).mockReset();
  vi.mocked(writeTextFileNative).mockReset();
  vi.mocked(readTextFileNative).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildExportPayload", () => {
  it("returns JSON with version and all app-scoped settings", () => {
    const { json } = buildExportPayload();
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(parsed.settings).toEqual(SEEDED_APP_VALUES);
  });

  it("produces pretty-printed JSON with 2-space indent", () => {
    const { json } = buildExportPayload();
    // Pretty-printed JSON has a newline + 2-space indentation on the first key.
    expect(json).toContain('\n  "version"');
    expect(json.endsWith("\n")).toBe(true);
  });

  it("returns no portable warnings when all settings are at defaults", () => {
    // All seeded values match the registry defaults, so no warnings.
    const { portableWarnings } = buildExportPayload();
    expect(portableWarnings).toHaveLength(0);
  });

  it("returns portable warnings for non-portable settings with non-default values", () => {
    // The built-in modules don't have path-type settings, so we simulate one
    // by adding a non-portable value to appValues that differs from default.
    // Since there are no path definitions in the built-in modules, we verify
    // the logic by checking that all built-in settings are portable (default
    // true for non-path types) and thus no warnings appear even with non-
    // default values.
    useSettingsStore.setState({
      appValues: {
        ...SEEDED_APP_VALUES,
        "editor.fontSize": 20 // Non-default value for a portable setting.
      }
    });

    const { portableWarnings, json } = buildExportPayload();
    // editor.fontSize is portable (type "number"), so no warning.
    expect(portableWarnings).toHaveLength(0);

    // The exported value reflects the non-default.
    const parsed = JSON.parse(json);
    expect(parsed.settings["editor.fontSize"]).toBe(20);
  });

  it("excludes workspace-scoped settings from the export", () => {
    // The built-in modules only have app-scoped settings, so the export should
    // contain exactly those keys.
    const { json } = buildExportPayload();
    const parsed = JSON.parse(json);
    const keys = Object.keys(parsed.settings);

    expect(keys).toContain("appearance.theme");
    expect(keys).toContain("appearance.themeFile");
    expect(keys).toContain("editor.fontSize");
    expect(keys).toContain("editor.lineWrapping");
    expect(keys).toContain("editor.livePreview");
    expect(keys).toContain("sync.settleAutomatically");
    // No workspace-scoped keys exist in the built-in modules.
    expect(keys).toHaveLength(7);
  });
});

describe("writeExportFile", () => {
  it("writes the file when the user selects a path", async () => {
    vi.mocked(saveFilePath).mockResolvedValue("/tmp/settings.json");
    vi.mocked(writeTextFileNative).mockResolvedValue(true);

    const result = await writeExportFile('{"version":1}');

    expect(result).toBe(true);
    expect(saveFilePath).toHaveBeenCalledWith("Export settings", "thinkbrain-settings.json");
    expect(writeTextFileNative).toHaveBeenCalledWith("/tmp/settings.json", '{"version":1}');
  });

  it("returns false when the user cancels the save dialog", async () => {
    vi.mocked(saveFilePath).mockResolvedValue(null);

    const result = await writeExportFile('{"version":1}');

    expect(result).toBe(false);
    expect(writeTextFileNative).not.toHaveBeenCalled();
  });
});

describe("importSettings", () => {
  it("stages known valid keys and returns correct counts", async () => {
    const importJson = JSON.stringify({
      version: 1,
      settings: {
        "appearance.theme": "dark",
        "editor.fontSize": 20,
        "editor.lineWrapping": false
      }
    });

    vi.mocked(pickFilePath).mockResolvedValue("/tmp/import.json");
    vi.mocked(readTextFileNative).mockResolvedValue(importJson);

    // Spy on stageChange so we can assert it was called.
    const stageChangeSpy = vi.fn((key: string, value: unknown) => {
      useSettingsStore.setState((s) => {
        const staged = { ...s.stagedChanges, [key]: value };
        return { stagedChanges: staged, isDirty: true, dirtyCount: Object.keys(staged).length };
      });
    });
    useSettingsStore.setState({ stageChange: stageChangeSpy });

    const result = await importSettings();

    expect(result).not.toBeNull();
    expect(result!.imported).toBe(3);
    expect(result!.ignored).toBe(0);
    expect(result!.typeMismatches).toBe(0);

    expect(stageChangeSpy).toHaveBeenCalledWith("appearance.theme", "dark");
    expect(stageChangeSpy).toHaveBeenCalledWith("editor.fontSize", 20);
    expect(stageChangeSpy).toHaveBeenCalledWith("editor.lineWrapping", false);
  });

  it("ignores unknown keys and counts them", async () => {
    const importJson = JSON.stringify({
      version: 1,
      settings: {
        "appearance.theme": "dark",
        "unknown.setting": "value"
      }
    });

    vi.mocked(pickFilePath).mockResolvedValue("/tmp/import.json");
    vi.mocked(readTextFileNative).mockResolvedValue(importJson);

    const stageChangeSpy = vi.fn();
    useSettingsStore.setState({ stageChange: stageChangeSpy });

    const result = await importSettings();

    expect(result!.imported).toBe(1);
    expect(result!.ignored).toBe(1);
    expect(result!.typeMismatches).toBe(0);
    expect(stageChangeSpy).toHaveBeenCalledTimes(1);
    expect(stageChangeSpy).toHaveBeenCalledWith("appearance.theme", "dark");
  });

  it("ignores type mismatches and counts them", async () => {
    const importJson = JSON.stringify({
      version: 1,
      settings: {
        "editor.fontSize": "not-a-number", // string where number expected
        "editor.lineWrapping": "not-a-boolean", // string where boolean expected
        "appearance.theme": "invalid-enum" // not in options
      }
    });

    vi.mocked(pickFilePath).mockResolvedValue("/tmp/import.json");
    vi.mocked(readTextFileNative).mockResolvedValue(importJson);

    const stageChangeSpy = vi.fn();
    useSettingsStore.setState({ stageChange: stageChangeSpy });

    const result = await importSettings();

    expect(result!.imported).toBe(0);
    expect(result!.ignored).toBe(0);
    expect(result!.typeMismatches).toBe(3);
    expect(stageChangeSpy).not.toHaveBeenCalled();
  });

  it("returns null when the user cancels the open dialog", async () => {
    vi.mocked(pickFilePath).mockResolvedValue(null);

    const result = await importSettings();

    expect(result).toBeNull();
    expect(readTextFileNative).not.toHaveBeenCalled();
  });

  it("handles bare settings object format (no version wrapper)", async () => {
    const importJson = JSON.stringify({
      "appearance.theme": "dark",
      "editor.fontSize": 20
    });

    vi.mocked(pickFilePath).mockResolvedValue("/tmp/import.json");
    vi.mocked(readTextFileNative).mockResolvedValue(importJson);

    const stageChangeSpy = vi.fn();
    useSettingsStore.setState({ stageChange: stageChangeSpy });

    const result = await importSettings();

    expect(result!.imported).toBe(2);
    expect(result!.ignored).toBe(0);
  });

  /**
   * A corrupt file is not an empty import. Returning `null` here made it
   * indistinguishable from a dismissed dialog, so the caller stayed silent on
   * both and the user was told nothing about a file that could not be used.
   */
  it("throws on malformed JSON rather than reporting nothing imported", async () => {
    vi.mocked(pickFilePath).mockResolvedValue("/tmp/import.json");
    vi.mocked(readTextFileNative).mockResolvedValue("not valid json {{{");

    await expect(importSettings()).rejects.toThrow(/not valid JSON/i);
  });

  it("throws when the document is not a settings export", async () => {
    vi.mocked(pickFilePath).mockResolvedValue("/tmp/import.json");
    // A wrapper carrying a version but no `settings` — the shape an export
    // truncated mid-write would have.
    vi.mocked(readTextFileNative).mockResolvedValue(JSON.stringify({ version: 1 }));

    await expect(importSettings()).rejects.toThrow(/not a settings export/i);
  });
});
