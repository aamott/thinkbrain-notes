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
import { appearanceModule, editorModule, settingsModule, syncModule } from "./modules";

/** Registers all built-in modules into a fresh registry. */
function registryWithBuiltIns(): SettingsRegistry {
  const registry = createSettingsRegistry();
  registry.register(appearanceModule);
  registry.register(editorModule);
  registry.register(settingsModule);
  registry.register(syncModule);
  return registry;
}

/** Wraps a dynamic definition as an extension schema for runtime guard tests. */
function moduleWithDynamicDefinition(definition: unknown): SettingsModule {
  return {
    id: "schema-safety",
    label: "Schema safety",
    scope: "app",
    sections: [{
      id: "schema-safety.section",
      label: "Schema safety",
      settings: [definition]
    }]
  } as unknown as SettingsModule;
}

describe("settings registry", () => {
  it("registers modules and exposes them via getAllModules/getModule", () => {
    const registry = registryWithBuiltIns();

    expect(registry.getAllModules().map((module) => module.id)).toEqual([
      "appearance",
      "editor",
      "settings",
      "sync"
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

    const livePreview = registry.getDefinition("editor.livePreview");
    expect(livePreview?.type).toBe("boolean");
    expect(livePreview?.default).toBe(true);
    expect(livePreview?.section).toBe("editor.display");

    expect(registry.getDefinition("appearance.missing")).toBeUndefined();
  });

  it("throws on duplicate module id", () => {
    const registry = createSettingsRegistry();
    registry.register(appearanceModule);

    expect(() => registry.register(appearanceModule)).toThrow(
      "already registered"
    );
  });

  it("rejects empty and non-lowercase kebab-case module ids", () => {
    const registry = createSettingsRegistry();
    for (const id of ["", "Editor", "editor.foo", "-editor", "editor-", "editor__view"]) {
      expect(() => registry.register({
        id,
        label: "Invalid",
        scope: "app",
        sections: []
      })).toThrow("Invalid settings module id");
    }
  });

  const baseDynamicDef = {
    key: "value",
    scope: "app",
    section: "schema-safety.section",
    label: "Value",
    description: "A dynamically supplied value."
  } as const;

  it("rejects a dynamic definition with a default of the wrong type", () => {
    const registry = createSettingsRegistry();

    expect(() => registry.register(moduleWithDynamicDefinition({
      ...baseDynamicDef, type: "number", default: "16"
    }))).toThrow(/Invalid default.*finite number.*received string/);
  });

  it("rejects enum definitions with missing or empty options", () => {
    const missingOptions = { ...baseDynamicDef, type: "enum", default: "one" };
    const emptyOptions = { ...missingOptions, options: [] };

    expect(() => createSettingsRegistry().register(
      moduleWithDynamicDefinition(missingOptions)
    )).toThrow(/options must be a non-empty array/);
    expect(() => createSettingsRegistry().register(
      moduleWithDynamicDefinition(emptyOptions)
    )).toThrow(/options must not be empty/);
  });

  it("rejects an enum default that is not one of its options", () => {
    const registry = createSettingsRegistry();

    expect(() => registry.register(moduleWithDynamicDefinition({
      ...baseDynamicDef, type: "enum", options: ["one", "two"], default: "three"
    }))).toThrow(/default "three" is not one of \[one, two\]/);
  });

  it("accepts null as a path default", () => {
    const registry = createSettingsRegistry();
    registry.register(moduleWithDynamicDefinition({
      ...baseDynamicDef, type: "path", default: null
    }));

    expect(registry.getDefinition("schema-safety.value")?.default).toBeNull();
  });

  it("disposes exactly one module, releases its sections, and allows re-registration", () => {
    const registry = createSettingsRegistry();
    const firstModule: SettingsModule = {
      id: "first-module",
      label: "First",
      scope: "app",
      sections: [{
        id: "shared.section",
        label: "Shared",
        settings: [{
          key: "value",
          type: "string",
          label: "Value",
          description: "First value",
          default: "first",
          scope: "app",
          section: "shared.section"
        }]
      }]
    };
    const secondModule: SettingsModule = {
      id: "second-module",
      label: "Second",
      scope: "app",
      sections: [{
        id: "second.section",
        label: "Second",
        settings: []
      }]
    };
    const firstRegistration = registry.register(firstModule);
    registry.register(secondModule);

    firstRegistration.dispose();
    firstRegistration.dispose();
    expect(registry.getAllModules().map((module) => module.id)).toEqual(["second-module"]);
    expect(registry.getDefinitionsForSection("shared.section")).toEqual([]);
    expect(registry.getModule("second-module")).toBe(secondModule);

    const replacementRegistration = registry.register(firstModule);
    expect(registry.getAllModules().map((module) => module.id)).toEqual([
      "second-module",
      "first-module"
    ]);
    expect(registry.getDefinition("first-module.value")?.default).toBe("first");
    replacementRegistration.dispose();
  });

  it("retains order across getAllModules/getModulesByScope/getAllDefinitions after disposal", () => {
    // Regression for the registry lookup type-safety story: the ordered
    // enumeration paths must not silently drop or duplicate entries when a
    // module is disposed, and remaining modules must keep their order.
    const registry = createSettingsRegistry();
    const moduleA: SettingsModule = {
      id: "mod-a",
      label: "A",
      scope: "app",
      sections: [{
        id: "mod-a.section",
        label: "A Section",
        settings: [{
          key: "value",
          type: "string",
          label: "Value",
          description: "A value",
          default: "a",
          scope: "app",
          section: "mod-a.section"
        }]
      }]
    };
    const moduleB: SettingsModule = {
      id: "mod-b",
      label: "B",
      scope: "app",
      sections: [{
        id: "mod-b.section",
        label: "B Section",
        settings: [{
          key: "value",
          type: "string",
          label: "Value",
          description: "B value",
          default: "b",
          scope: "app",
          section: "mod-b.section"
        }]
      }]
    };
    const moduleC: SettingsModule = {
      id: "mod-c",
      label: "C",
      scope: "workspace",
      sections: [{
        id: "mod-c.section",
        label: "C Section",
        settings: []
      }]
    };
    const aHandle = registry.register(moduleA);
    registry.register(moduleB);
    registry.register(moduleC);

    aHandle.dispose();
    aHandle.dispose(); // idempotent: must not disturb moduleB or moduleC.

    expect(registry.getAllModules().map((m) => m.id)).toEqual(["mod-b", "mod-c"]);
    expect(registry.getModulesByScope("app").map((m) => m.id)).toEqual(["mod-b"]);
    expect(registry.getModulesByScope("workspace").map((m) => m.id)).toEqual([
      "mod-c"
    ]);
    expect(registry.getAllDefinitions().map((d) => d.key)).toEqual([
      "mod-b.value"
    ]);
    expect(registry.getDefinition("mod-a.value")).toBeUndefined();
    expect(registry.getDefinitionsForSection("mod-a.section")).toEqual([]);
  });

  it("rejects duplicate section ids, including empty sections", () => {
    const registry = createSettingsRegistry();
    const module: SettingsModule = {
      id: "duplicate-sections",
      label: "Duplicate",
      scope: "app",
      sections: [
        { id: "empty", label: "Empty" },
        { id: "empty", label: "Again" }
      ]
    };

    expect(() => registry.register(module)).toThrow('Duplicate section id "empty"');
    expect(registry.getModule("duplicate-sections")).toBeUndefined();
  });

  it("returns definitions for a section id", () => {
    const registry = registryWithBuiltIns();

    const displayDefs = registry.getDefinitionsForSection("editor.display");
    expect(displayDefs.map((def) => def.key)).toEqual([
      "editor.fontSize",
      "editor.lineWrapping",
      "editor.livePreview"
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
      "settings",
      "sync"
    ]);
    expect(registry.getModulesByScope("workspace").map((module) => module.id)).toEqual([
      "sync"
    ]);
  });

  it("projects a mixed-scope module into each scope with only matching settings", () => {
    const registry = registryWithBuiltIns();

    const appSync = registry.getModulesByScope("app").find((module) => module.id === "sync");
    expect(appSync?.sections.map((section) => section.id)).toEqual([
      "sync.conflicts",
      "sync.history"
    ]);
    expect(appSync?.sections[0]?.settings?.map((def) => def.key)).toEqual([
      "settleAutomatically"
    ]);

    const workspaceSync = registry
      .getModulesByScope("workspace")
      .find((module) => module.id === "sync");
    expect(workspaceSync?.sections.map((section) => section.id)).toEqual([
      "sync.destination"
    ]);
    expect(workspaceSync?.sections[0]?.settings?.map((def) => def.key)).toEqual([
      "destination",
      "signInProfile"
    ]);
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

  it("throws when two modules register the same section id", () => {
    const registry = createSettingsRegistry();
    const moduleA: SettingsModule = {
      id: "module-a",
      label: "A",
      scope: "app",
      sections: [{ id: "shared.section", label: "Shared" }]
    };
    const moduleB: SettingsModule = {
      id: "module-b",
      label: "B",
      scope: "app",
      sections: [{ id: "shared.section", label: "Shared" }]
    };
    registry.register(moduleA);

    expect(() => registry.register(moduleB)).toThrow(
      "already registered by another"
    );
  });

  it("throws when one module has two settings resolving to the same full key", () => {
    const registry = createSettingsRegistry();
    const module: SettingsModule = {
      id: "dup-keys",
      label: "Dup",
      scope: "app",
      sections: [{
        id: "dup-keys.section",
        label: "Section",
        settings: [
          {
            key: "value",
            type: "string",
            default: "first",
            scope: "app",
            section: "dup-keys.section",
            label: "First",
            description: "First value"
          },
          {
            key: "value",
            type: "string",
            default: "second",
            scope: "app",
            section: "dup-keys.section",
            label: "Second",
            description: "Second value"
          }
        ]
      }]
    };

    expect(() => registry.register(module)).toThrow("Duplicate setting key");
  });

  it("rejects migrations with negative fromVersion or toVersion", () => {
    const registry = createSettingsRegistry();

    expect(() =>
      registry.registerMigration({
        fromVersion: -1,
        toVersion: 1,
        migrate: (value) => value
      })
    ).toThrow("non-negative");
    expect(() =>
      registry.registerMigration({
        fromVersion: 0,
        toVersion: -1,
        migrate: (value) => value
      })
    ).toThrow("non-negative");
  });

  it("rejects migrations where fromVersion >= toVersion", () => {
    const registry = createSettingsRegistry();

    expect(() =>
      registry.registerMigration({
        fromVersion: 2,
        toVersion: 2,
        migrate: (value) => value
      })
    ).toThrow("must be less than");
    expect(() =>
      registry.registerMigration({
        fromVersion: 3,
        toVersion: 1,
        migrate: (value) => value
      })
    ).toThrow("must be less than");
  });

  it("rejects migrations with a duplicate fromVersion", () => {
    const registry = createSettingsRegistry();
    registry.registerMigration({
      fromVersion: 0,
      toVersion: 1,
      migrate: (value) => value
    });

    expect(() =>
      registry.registerMigration({
        fromVersion: 0,
        toVersion: 2,
        migrate: (value) => value
      })
    ).toThrow("already registered");
  });

  it("rejects migrations whose range overlaps an existing migration range", () => {
    const registry = createSettingsRegistry();
    registry.registerMigration({
      fromVersion: 0,
      toVersion: 2,
      migrate: (value) => value
    });

    expect(() =>
      registry.registerMigration({
        fromVersion: 1,
        toVersion: 3,
        migrate: (value) => value
      })
    ).toThrow("overlaps existing range [0, 2)");
  });
});

describe("extractDefaults", () => {
  it("returns a flat full-key -> default map for app scope", () => {
    const registry = registryWithBuiltIns();

    expect(extractDefaults(registry, "app")).toEqual({
      "appearance.shellMode": "auto",
      "appearance.theme": "system",
      "appearance.themeFile": null,
      "editor.fontSize": 16,
      "editor.lineWrapping": true,
      "editor.livePreview": true,
      "settings.autosave": false,
      "sync.settleAutomatically": true,
      "sync.historyPolicy": ""
    });
  });

  it("returns workspace defaults from per-setting scope, not module scope", () => {
    const registry = registryWithBuiltIns();
    expect(extractDefaults(registry, "workspace")).toEqual({
      "sync.destination": "",
      "sync.signInProfile": ""
    });
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
      "sync.destination": "",
      "sync.signInProfile": "",
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

  it("exposes sync.destination as a non-portable workspace setting", () => {
    const registry = registryWithBuiltIns();
    const def = registry.getDefinition("sync.destination");

    expect(def).toMatchObject({
      key: "sync.destination",
      type: "string",
      default: "",
      scope: "workspace",
      section: "sync.destination",
      portable: false
    });
  });

  it("exposes sync.signInProfile as a non-portable workspace setting", () => {
    const registry = registryWithBuiltIns();
    const def = registry.getDefinition("sync.signInProfile");

    expect(def).toMatchObject({
      key: "sync.signInProfile",
      type: "string",
      default: "",
      scope: "workspace",
      section: "sync.destination",
      portable: false
    });
  });
});
