import { describe, expect, it } from "vitest";
import { CURRENT_SETTINGS_VERSION, DEFAULT_APP_SETTINGS } from "@thinkbrain/core";

import {
  loadAppSettings,
  saveAppSettings,
  type SettingsStorageAdapter
} from "./settingsService";

function memorySettingsStorage(raw: string | null): {
  readonly storage: SettingsStorageAdapter;
  readonly written: () => string | null;
} {
  let written: string | null = null;

  return {
    storage: {
      readAppSettings: async () => raw,
      writeAppSettings: async (contents) => {
        written = contents;
      },
      readWorkspaceSettings: async () => null,
      writeWorkspaceSettings: async () => undefined
    },
    written: () => written
  };
}

describe("settings service", () => {
  it("loads raw native JSON through the core parser", async () => {
    const { storage } = memorySettingsStorage(
      JSON.stringify({
        version: CURRENT_SETTINGS_VERSION,
        theme: "dark",
        editor: {
          fontSize: 19,
          lineWrapping: false
        }
      })
    );

    await expect(loadAppSettings(storage)).resolves.toEqual({
      settings: {
        version: CURRENT_SETTINGS_VERSION,
        theme: "dark",
        editor: {
          fontSize: 19,
          lineWrapping: false
        }
      },
      diagnostics: []
    });
  });

  it("falls back to defaults when native app settings are absent", async () => {
    const { storage } = memorySettingsStorage(null);
    const result = await loadAppSettings(storage);

    expect(result.settings).toEqual(DEFAULT_APP_SETTINGS);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "settings.missing" })
    ]);
  });

  it("serializes app settings before writing native raw JSON", async () => {
    const { storage, written } = memorySettingsStorage(null);

    await saveAppSettings(
      {
        version: CURRENT_SETTINGS_VERSION,
        theme: "light",
        editor: {
          fontSize: 17,
          lineWrapping: true
        }
      },
      storage
    );

    expect(written()).toBe(`{
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
