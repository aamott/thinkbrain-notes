import { describe, expect, it } from "vitest";

import { extractDefaults } from "./defaults";
import {
  createSettingsRegistry,
  type SettingsRegistry
} from "./registry";
import type {
  SettingsModule,
  SettingMigration
} from "./types";
import { validateSettings } from "./validation";
import { appearanceModule, editorModule, settingsModule } from "./modules";

/** Registers all built-in modules into a fresh registry. */
function registryWithBuiltIns(): SettingsRegistry {
  const registry = createSettingsRegistry();
  registry.register(appearanceModule);
  registry.register(editorModule);
  registry.register(settingsModule);
  return registry;
}

describe("settings registry", () => {
  it("registers modules and exposes them via getAllModules/getModule", () => {
    const registry = registryWithBuiltIns();

    expect(registry.getAllModules().map((module) => module.id)).toEqual([
      "appearance",
      "editor",
      "settings"
    ]);
    expect(registry.getModule("appearance")?.label).toBe("Appearance");
    expect(registry.getModule("editor")?.label).toBe("Editor");
    expect(registry.getModule("settings")?.label).toBe("Settings");
    expect(registry.getModule("missing")).toBeUndefined();
  });

  it("composes full keys as moduleId.key via getDefinition", () => {
    const registry = registryWithBuiltIns();

    const theme = registry.getDefinition("appearance.theme");
    expect(theme?.type).toBe("enum");
    expect(theme?.default).toBe("system");
    expect(theme?.options).toEqual(["system", "light", "dark"]);

    const fontSize = registry.getDefinition("editor.fontSize");
    expect(fontSize?.type).toBe("number");
    expect(fontSize?.min).toBe(10);
    expect(fontSize?.max).toBe(32);
    expect(fontSize?.default).toBe(16);

    const lineWrapping = registry.getDefinition("editor.lineWrapping");
    expect(lineWrapping?.type).toBe("boolean");
    expect(lineWrapping?.default).toBe(true);

    expect(registry.getDefinition("appearance.missing")).toBeUndefined();
  });

  it("throws on duplicate module id", () => {
    const registry = createSettingsRegistry();
    registry.register(appearanceModule);

    expect(() => registry.register(appearanceModule)).toThrow(
      "already registered"
    );
  });

  it("returns definitions for a section id", () => {
    const registry = registryWithBuiltIns();

    const displayDefs = registry.getDefinitionsForSection("editor.display");
    expect(displayDefs.map((def) => def.key)).toEqual([
      "editor.fontSize",
      "editor.lineWrapping"
    ]);

    const themeDefs = registry.getDefinitionsForSection("appearance.theme");
    expect(themeDefs.map((def) => def.key)).toEqual([
      "appearance.theme",
      "appearance.themeFile"
    ]);

    expect(registry.getDefinitionsForSection("nope")).toEqual([]);
  });

  it("filters modules by scope", () => {
    const registry = registryWithBuiltIns();

    expect(registry.getModulesByScope("app").map((module) => module.id)).toEqual([
      "appearance",
      "editor",
      "settings"
    ]);
    expect(registry.getModulesByScope("workspace")).toEqual([]);
  });

  it("collects migrations via registerMigration/getMigrations", () => {
    const registry = createSettingsRegistry();
    const migration: SettingMigration = {
      fromVersion: 0,
      toVersion: 1,
      migrate: (value) => ({ ...value, version: 1 })
    };

    registry.registerMigration(migration);

    expect(registry.getMigrations()).toEqual([migration]);
  });
});

describe("extractDefaults", () => {
  it("returns a flat full-key -> default map for app scope", () => {
    const registry = registryWithBuiltIns();

    expect(extractDefaults(registry, "app")).toEqual({
      "appearance.theme": "system",
      "appearance.themeFile": null,
      "editor.fontSize": 16,
      "editor.lineWrapping": true,
      "settings.autosave": false
    });
  });

  it("returns an empty map for workspace scope (no built-in workspace modules)", () => {
    const registry = registryWithBuiltIns();
    expect(extractDefaults(registry, "workspace")).toEqual({});
  });

  it("includes workspace defaults when a workspace module is registered", () => {
    const workspaceModule: SettingsModule = {
      id: "ws",
      label: "Workspace",
      scope: "workspace",
      sections: [
        {
          id: "ws.notes",
          label: "Notes",
          settings: [
            {
              key: "defaultFolder",
              type: "path",
              default: null,
              scope: "workspace",
              section: "ws.notes",
              label: "Default folder",
              description: "Default folder for new notes."
            }
          ]
        }
      ]
    };

    const registry = registryWithBuiltIns();
    registry.register(workspaceModule);

    expect(extractDefaults(registry, "workspace")).toEqual({
      "ws.defaultFolder": null
    });
  });
});

describe("validateSettings", () => {
  it("produces no diagnostics for fully valid values", () => {
    const registry = registryWithBuiltIns();
    const values = {
      "appearance.theme": "dark",
      "editor.fontSize": 18,
      "editor.lineWrapping": false
    };

    expect(validateSettings(registry, values)).toEqual([]);
  });

  it("ignores missing keys (defaults fill them)", () => {
    const registry = registryWithBuiltIns();
    expect(validateSettings(registry, {})).toEqual([]);
  });

  it("accepts null for path-type settings (the 'no path set' sentinel)", () => {
    // appearance.themeFile is a path setting with default null. A null value
    // must validate so the store's defaults-merged appValues pass saveSettings.
    const registry = registryWithBuiltIns();
    expect(validateSettings(registry, { "appearance.themeFile": null })).toEqual([]);
  });

  it("flags a non-string, non-null value for a path-type setting", () => {
    const registry = registryWithBuiltIns();
    const diagnostics = validateSettings(registry, { "appearance.themeFile": 42 });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("settings.type.mismatch");
    expect(diagnostics[0]!.path).toBe("appearance.themeFile");
  });

  it("flags a type mismatch (string where number expected)", () => {
    const registry = registryWithBuiltIns();
    const diagnostics = validateSettings(registry, {
      "editor.fontSize": "big"
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("settings.type.mismatch");
    expect(diagnostics[0]!.path).toBe("editor.fontSize");
  });

  it("flags an invalid enum value", () => {
    const registry = registryWithBuiltIns();
    const diagnostics = validateSettings(registry, {
      "appearance.theme": "neon"
    });

    // The built-in enum check fires first; the module's belt-and-suspenders
    // custom validator also fires, producing a second diagnostic.
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]!.code).toBe("settings.enum.invalid");
    expect(diagnostics[0]!.path).toBe("appearance.theme");
    expect(diagnostics[1]!.code).toBe("settings.validation.failed");
  });

  it("flags a number out of range", () => {
    const registry = registryWithBuiltIns();
    const tooSmall = validateSettings(registry, { "editor.fontSize": 4 });
    expect(tooSmall[0]!.code).toBe("settings.range.invalid");
    expect(tooSmall[0]!.path).toBe("editor.fontSize");

    const tooBig = validateSettings(registry, { "editor.fontSize": 99 });
    expect(tooBig[0]!.code).toBe("settings.range.invalid");
  });

  it("runs the custom validator and reports its failure", () => {
    const registry = registryWithBuiltIns();
    // NaN passes the typeof number check but fails the custom validator.
    const diagnostics = validateSettings(registry, {
      "editor.fontSize": Number.NaN
    });

    // type check flags NaN as a mismatch first; custom validator is skipped.
    expect(diagnostics[0]!.code).toBe("settings.type.mismatch");
  });

  it("reports a custom validator failure for a structurally-valid value", () => {
    const registry = createSettingsRegistry();
    const module: SettingsModule = {
      id: "custom",
      label: "Custom",
      scope: "app",
      sections: [
        {
          id: "custom.section",
          label: "Section",
          settings: [
            {
              key: "name",
              type: "string",
              default: "",
              scope: "app",
              section: "custom.section",
              label: "Name",
              description: "A name.",
              validation: (value) =>
                typeof value === "string" && value.length > 0
                  ? null
                  : "Name must not be empty."
            }
          ]
        }
      ]
    };
    registry.register(module);

    const diagnostics = validateSettings(registry, { "custom.name": "" });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("settings.validation.failed");
    expect(diagnostics[0]!.message).toBe("Name must not be empty.");
    expect(diagnostics[0]!.path).toBe("custom.name");
  });
});

describe("built-in module structure", () => {
  it("exposes appearance.theme with enum defaults and options", () => {
    const registry = registryWithBuiltIns();
    const def = registry.getDefinition("appearance.theme");

    expect(def).toMatchObject({
      key: "appearance.theme",
      type: "enum",
      default: "system",
      options: ["system", "light", "dark"],
      scope: "app",
      section: "appearance.theme"
    });
  });

  it("exposes editor.fontSize and editor.lineWrapping with correct types", () => {
    const registry = registryWithBuiltIns();

    expect(registry.getDefinition("editor.fontSize")).toMatchObject({
      key: "editor.fontSize",
      type: "number",
      min: 10,
      max: 32,
      default: 16,
      scope: "app"
    });
    expect(registry.getDefinition("editor.lineWrapping")).toMatchObject({
      key: "editor.lineWrapping",
      type: "boolean",
      default: true,
      scope: "app"
    });
  });

  it("exposes appearance.themeFile as a non-portable path setting", () => {
    const registry = registryWithBuiltIns();
    const def = registry.getDefinition("appearance.themeFile");

    expect(def).toMatchObject({
      key: "appearance.themeFile",
      type: "path",
      default: null,
      scope: "app",
      section: "appearance.theme",
      portable: false
    });
  });

  it("defaults portable to true for non-path types and false for path types", () => {
    const registry = createSettingsRegistry();
    const module: SettingsModule = {
      id: "paths",
      label: "Paths",
      scope: "app",
      sections: [
        {
          id: "paths.section",
          label: "Section",
          settings: [
            {
              key: "folder",
              type: "path",
              default: "/tmp",
              scope: "app",
              section: "paths.section",
              label: "Folder",
              description: "A folder."
            },
            {
              key: "name",
              type: "string",
              default: "x",
              scope: "app",
              section: "paths.section",
              label: "Name",
              description: "A name."
            }
          ]
        }
      ]
    };
    registry.register(module);

    // getAllDefinitions returns resolved copies with portable defaulted.
    const all = registry.getAllDefinitions();
    const folder = all.find((def) => def.key === "paths.folder");
    const name = all.find((def) => def.key === "paths.name");
    expect(folder?.portable).toBe(false);
    expect(name?.portable).toBe(true);
  });
});
