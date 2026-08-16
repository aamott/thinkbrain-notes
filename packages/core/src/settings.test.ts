import { describe, expect, it } from "vitest";

import {
  CURRENT_SETTINGS_VERSION,
  DEFAULT_APP_SETTINGS,
  parseAppSettings,
  serializeAppSettings
} from "./settings";

describe("app settings", () => {
  it("returns defaults with a diagnostic when the settings file is absent", () => {
    const result = parseAppSettings(null);

    expect(result.settings).toEqual(DEFAULT_APP_SETTINGS);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "settings.missing",
        severity: "warning"
      })
    ]);
  });

  it("returns defaults with a clear diagnostic for invalid JSON", () => {
    const result = parseAppSettings("{not json");

    expect(result.settings).toEqual(DEFAULT_APP_SETTINGS);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "settings.invalid_json",
        severity: "error"
      })
    ]);
  });

  it("validates current settings and ignores unknown fields", () => {
    const result = parseAppSettings(
      JSON.stringify({
        version: CURRENT_SETTINGS_VERSION,
        theme: "dark",
        ignoredPluginSetting: true,
        editor: {
          fontSize: 18,
          lineWrapping: false,
          unknownEditorSetting: "ignored"
        }
      })
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.settings).toEqual({
      version: CURRENT_SETTINGS_VERSION,
      theme: "dark",
      editor: {
        fontSize: 18,
        lineWrapping: false
      }
    });
  });

  it("keeps valid fields while defaulting invalid field values", () => {
    const result = parseAppSettings(
      JSON.stringify({
        version: CURRENT_SETTINGS_VERSION,
        theme: "light",
        editor: {
          fontSize: 4,
          lineWrapping: "yes"
        }
      })
    );

    expect(result.settings).toEqual({
      version: CURRENT_SETTINGS_VERSION,
      theme: "light",
      editor: {
        fontSize: DEFAULT_APP_SETTINGS.editor.fontSize,
        lineWrapping: DEFAULT_APP_SETTINGS.editor.lineWrapping
      }
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "settings.editor.font_size.invalid",
      "settings.editor.line_wrapping.invalid"
    ]);
  });

  it("migrates fabricated v0 settings into the current schema", () => {
    const result = parseAppSettings(
      JSON.stringify({
        theme: "dark",
        fontSize: 20,
        lineWrapping: false
      })
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.settings).toEqual({
      version: CURRENT_SETTINGS_VERSION,
      theme: "dark",
      editor: {
        fontSize: 20,
        lineWrapping: false
      }
    });
  });

  /**
   * The same contract the registry-backed reader keeps: a version this build has
   * not reached means "there may be more here than I understand", not "there is
   * nothing here". Two readers of the same document disagreeing about that is
   * how one of them quietly reintroduces the loss the other fixed.
   */
  it("reads a document from a newer build rather than discarding it", () => {
    const result = parseAppSettings(
      JSON.stringify({
        version: CURRENT_SETTINGS_VERSION + 1,
        theme: "dark",
        editor: { fontSize: 18, lineWrapping: false },
        somethingLaterAdded: "not understood here"
      })
    );

    expect(result.settings.theme).toBe("dark");
    expect(result.settings.editor.fontSize).toBe(18);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "settings.version.unsupported",
        severity: "warning"
      })
    ]);
  });

  it("still uses defaults when the version itself is not a version", () => {
    const result = parseAppSettings(JSON.stringify({ version: "one", theme: "dark" }));

    expect(result.settings).toEqual(DEFAULT_APP_SETTINGS);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "settings.version.invalid", severity: "error" })
    ]);
  });

  it("serializes settings as stable pretty JSON", () => {
    expect(
      serializeAppSettings({
        version: CURRENT_SETTINGS_VERSION,
        theme: "light",
        editor: {
          fontSize: 17,
          lineWrapping: true
        }
      })
    ).toBe(`{
  "version": 1,
  "theme": "light",
  "editor": {
    "fontSize": 17,
    "lineWrapping": true
  }
}
`);
  });
});
