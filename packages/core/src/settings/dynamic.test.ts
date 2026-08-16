import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSettingsRegistry } from "./registry";
import { parseDynamicAppSettings, serializeDynamicAppSettings } from "./dynamic";

const appSettingsRegistry = createSettingsRegistry();

describe("scope is a property of the setting, not its module (D45)", () => {
  /**
   * A workspace-scoped setting declared inside an app-scoped module must not
   * travel in the app settings file. The journal is exactly this shape: an
   * app-scoped module whose folder and metadata fields are per workspace.
   */
  const MODULE_ID = "extension-mixed";
  let registration: { dispose: () => void } | null = null;

  beforeEach(() => {
    registration = appSettingsRegistry.register({
      id: MODULE_ID,
      label: "Mixed",
      scope: "app",
      sections: [
        {
          id: `${MODULE_ID}.main`,
          label: "Main",
          settings: [
            {
              key: "fields",
              type: "string",
              label: "Fields",
              description: "Per workspace.",
              default: "[]",
              scope: "workspace",
              section: `${MODULE_ID}.main`
            }
          ]
        }
      ]
    });
  });

  afterEach(() => {
    registration?.dispose();
    registration = null;
  });

  it("does not read a workspace-scoped key out of the app file", () => {
    const result = parseDynamicAppSettings(
      JSON.stringify({ version: 1, [`${MODULE_ID}.fields`]: "[{\"id\":\"smuggled\"}]" }),
      appSettingsRegistry
    );

    // Absent entirely, not defaulted: app values have no business carrying a
    // per-workspace key at all.
    expect(`${MODULE_ID}.fields` in result.values).toBe(false);
  });

  it("does not write a workspace-scoped key into the app file", () => {
    const written = serializeDynamicAppSettings(
      { [`${MODULE_ID}.fields`]: "[{\"id\":\"mood\"}]" },
      appSettingsRegistry,
      null
    );

    expect(Object.keys(JSON.parse(written))).not.toContain(`${MODULE_ID}.fields`);
  });
});
