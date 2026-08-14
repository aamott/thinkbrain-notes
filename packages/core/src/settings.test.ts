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
