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

/**
 * Running a newer build and then an older one is an ordinary week here, and it
 * used to cost the user every setting they had: the older build rejected the
 * newer document outright and the next save wrote defaults over it. A version
 * it does not recognize means "there may be more here than I understand", not
 * "there is nothing here".
 */
describe("a document from a newer build", () => {
  const newer = JSON.stringify({
    version: 99,
    "editor.fontSize": 22,
    "some.future.key": { kept: true }
  });
  let registration: { dispose: () => void } | null = null;

  beforeEach(() => {
    registration = appSettingsRegistry.register({
      id: "editor",
      label: "Editor",
      scope: "app",
      sections: [
        {
          id: "editor.display",
          label: "Display",
          settings: [
            {
              key: "fontSize",
              type: "number",
              label: "Font size",
              description: "Editor font size in pixels.",
              default: 16,
              scope: "app",
              section: "editor.display"
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

  it("is read for the settings this build does understand", () => {
    const result = parseDynamicAppSettings(newer, appSettingsRegistry);

    expect(result.values["editor.fontSize"]).toBe(22);
  });

  it("says so as a warning, rather than an error claiming defaults were used", () => {
    const result = parseDynamicAppSettings(newer, appSettingsRegistry);
    const diagnostic = result.diagnostics.find(
      (entry) => entry.code === "settings.version.unsupported"
    );

    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.message).not.toContain("defaults were used");
  });

  it("keeps its version and its unknown keys when this build writes it back", () => {
    const written: Record<string, unknown> = JSON.parse(
      serializeDynamicAppSettings({ "editor.fontSize": 14 }, appSettingsRegistry, newer)
    );

    // Stamping the version down would tell the newer build its own document had
    // been migrated backwards, and it would stop running the migration that
    // fills whatever `some.future.key` feeds.
    expect(written.version).toBe(99);
    expect(written["some.future.key"]).toEqual({ kept: true });
    expect(written["editor.fontSize"]).toBe(14);
  });
});
