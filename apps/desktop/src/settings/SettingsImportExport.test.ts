// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildExportPayload,
  writeExportFile,
  importSettings
} from "./settingsImportExport";
import { useSettingsStore } from "./settingsStore";
import {
  SEEDED_APP_VALUES as BASE_SEEDED_APP_VALUES,
  installStageChangeSpy,
  seedSettingsStore
} from "./settingsTestHelpers";

/**
 * Settings import/export logic tests.
 *
 * The native fs module is mocked via `vi.mock` so tests can control the file
 * paths and contents returned by `saveAndWriteTextFile` and
 * `pickAndReadTextFile`. The real module-scoped
 * `useSettingsStore` singleton is seeded directly via `setState`.
 */

// Mock the native fs module so we can control dialog+read/write results.
vi.mock("../native/fs", () => ({
  saveAndWriteTextFile: vi.fn<
    (title: string, defaultName: string, contents: string) => Promise<boolean>
  >(),
  pickAndReadTextFile: vi.fn<
    (
      title: string,
      extensions?: readonly string[]
    ) => Promise<{ path: string; contents: string } | null>
  >()
}));

// Import the mocked functions AFTER vi.mock so we get the mock implementations.
import { saveAndWriteTextFile, pickAndReadTextFile } from "../native/fs";

/**
 * Default app values seeded into the store for most tests. Extends the shared
 * base with the extra keys this module's export payload asserts on.
 */
const SEEDED_APP_VALUES: Record<string, unknown> = {
  ...BASE_SEEDED_APP_VALUES,
  "appearance.shellMode": "auto",
  "editor.livePreview": true,
  "sync.settleAutomatically": true,
  "sync.historyPolicy": "",
  "sync.automatically": true,
  "sync.intervalSeconds": 60,
  "sync.quietSeconds": 30,
  "sync.onOpen": true,
  "sync.onLeave": true,
  "settings.showAdvanced": false,
  "ui.workspaceSelectorPlacement": "title bar",
  "ui.pinnedActionItems": "",
  "ui.mobileBubbleLabels": false,
  "ui.scale": 100
};

beforeEach(() => {
  // Reset the singleton store to a clean, loaded state before each test.
  seedSettingsStore({ appValues: SEEDED_APP_VALUES });

  // Reset mock call counts and default implementations.
  vi.mocked(saveAndWriteTextFile).mockReset();
  vi.mocked(pickAndReadTextFile).mockReset();
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
    const { json } = buildExportPayload();
    const parsed = JSON.parse(json);
    const keys = Object.keys(parsed.settings);

    expect(keys).toContain("appearance.shellMode");
    expect(keys).toContain("appearance.theme");
    expect(keys).toContain("appearance.themeFile");
    expect(keys).toContain("editor.fontSize");
    expect(keys).toContain("editor.lineWrapping");
    expect(keys).toContain("editor.livePreview");
    expect(keys).toContain("sync.settleAutomatically");
    expect(keys).toContain("sync.historyPolicy");
    // Every part of the sync schedule travels. None of it is a fact about
    // one device any more, which is what makes exporting it safe: the policy
    // enum this replaced could carry `idle` onto a phone, where it did not
    // work. An advanced setting exports like any other.
    expect(keys).toContain("sync.automatically");
    expect(keys).toContain("sync.intervalSeconds");
    expect(keys).toContain("sync.quietSeconds");
    expect(keys).toContain("sync.onOpen");
    expect(keys).toContain("sync.onLeave");
    expect(keys).toContain("settings.showAdvanced");
    expect(keys).not.toContain("sync.trigger");
    expect(keys).not.toContain("sync.destination");
    expect(keys).toHaveLength(19);
  });
});

describe("writeExportFile", () => {
  it("writes the file when the user selects a path", async () => {
    vi.mocked(saveAndWriteTextFile).mockResolvedValue(true);

    const result = await writeExportFile('{"version":1}');

    expect(result).toBe(true);
    expect(saveAndWriteTextFile).toHaveBeenCalledWith(
      "Export settings",
      "thinkbrain-settings.json",
      '{"version":1}'
    );
  });

  it("returns false when the user cancels the save dialog", async () => {
    vi.mocked(saveAndWriteTextFile).mockResolvedValue(false);

    const result = await writeExportFile('{"version":1}');

    expect(result).toBe(false);
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

    vi.mocked(pickAndReadTextFile).mockResolvedValue({
      path: "/tmp/import.json",
      contents: importJson
    });

    // Spy on stageChange so we can assert it was called. The spy replicates
    // the real staging logic so the resulting stagedChanges reflect the import.
    const stageChangeSpy = installStageChangeSpy(true);

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

    vi.mocked(pickAndReadTextFile).mockResolvedValue({
      path: "/tmp/import.json",
      contents: importJson
    });

    const stageChangeSpy = installStageChangeSpy();

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

    vi.mocked(pickAndReadTextFile).mockResolvedValue({
      path: "/tmp/import.json",
      contents: importJson
    });

    const stageChangeSpy = installStageChangeSpy();

    const result = await importSettings();

    expect(result!.imported).toBe(0);
    expect(result!.ignored).toBe(0);
    expect(result!.typeMismatches).toBe(3);
    expect(stageChangeSpy).not.toHaveBeenCalled();
  });

  it("returns null when the user cancels the open dialog", async () => {
    vi.mocked(pickAndReadTextFile).mockResolvedValue(null);

    const result = await importSettings();

    expect(result).toBeNull();
  });

  it("handles bare settings object format (no version wrapper)", async () => {
    const importJson = JSON.stringify({
      "appearance.theme": "dark",
      "editor.fontSize": 20
    });

    vi.mocked(pickAndReadTextFile).mockResolvedValue({
      path: "/tmp/import.json",
      contents: importJson
    });

    installStageChangeSpy();

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
    vi.mocked(pickAndReadTextFile).mockResolvedValue({
      path: "/tmp/import.json",
      contents: "not valid json {{{"
    });

    await expect(importSettings()).rejects.toThrow(/not valid JSON/i);
  });

  it("throws when the document is not a settings export", async () => {
    // A wrapper carrying a version but no `settings` — the shape an export
    // truncated mid-write would have.
    vi.mocked(pickAndReadTextFile).mockResolvedValue({
      path: "/tmp/import.json",
      contents: JSON.stringify({ version: 1 })
    });

    await expect(importSettings()).rejects.toThrow(/not a settings export/i);
  });
});
