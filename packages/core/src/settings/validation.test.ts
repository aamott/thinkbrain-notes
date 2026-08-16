import { describe, expect, it } from "vitest";

import { createSettingsRegistry } from "./registry";
import type {
  SettingDefinition,
  SettingsModule,
  SettingType
} from "./types";
import { validateSettings } from "./validation";

const validationModule: SettingsModule = {
  id: "validation-types",
  label: "Validation types",
  scope: "app",
  sections: [{
    id: "validation-types.section",
    label: "Validation types",
    settings: [
      {
        key: "boolean",
        type: "boolean",
        default: false,
        scope: "app",
        section: "validation-types.section",
        label: "Boolean",
        description: "A boolean setting."
      },
      {
        key: "string",
        type: "string",
        default: "",
        scope: "app",
        section: "validation-types.section",
        label: "String",
        description: "A string setting."
      },
      {
        key: "number",
        type: "number",
        default: 0,
        scope: "app",
        section: "validation-types.section",
        label: "Number",
        description: "A number setting."
      },
      {
        key: "enum",
        type: "enum",
        options: ["one", "two"],
        default: "one",
        scope: "app",
        section: "validation-types.section",
        label: "Enum",
        description: "An enum setting."
      },
      {
        key: "path",
        type: "path",
        default: null,
        scope: "app",
        section: "validation-types.section",
        label: "Path",
        description: "A path setting."
      }
    ]
  }]
};

function registryWithValidationTypes() {
  const registry = createSettingsRegistry();
  registry.register(validationModule);
  return registry;
}

/**
 * Compile-time exhaustiveness fixture. Adding a SettingType requires adding a
 * branch here, mirroring the guard in checkType.
 */
function exhaustiveSettingTypeFixture(type: SettingType): SettingType {
  switch (type) {
    case "boolean":
    case "string":
    case "number":
    case "enum":
    case "path":
      return type;
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

describe("settings validation", () => {
  it("accepts valid values for every current setting type", () => {
    const registry = registryWithValidationTypes();

    expect(validateSettings(registry, {
      "validation-types.boolean": true,
      "validation-types.string": "text",
      "validation-types.number": 42,
      "validation-types.enum": "two",
      "validation-types.path": null
    })).toEqual([]);
  });

  it("rejects Infinity and -Infinity for number settings", () => {
    const registry = registryWithValidationTypes();

    for (const value of [Infinity, -Infinity]) {
      const diagnostics = validateSettings(registry, {
        "validation-types.number": value
      });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.code).toBe("settings.range.invalid");
    }
  });

  it("checks enum membership", () => {
    const diagnostics = validateSettings(registryWithValidationTypes(), {
      "validation-types.enum": "three"
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("settings.enum.invalid");
  });

  it("keeps defaults coupled to their type discriminators at compile time", () => {
    // @ts-expect-error Number definitions cannot declare a string default.
    const definition: SettingDefinition = {
      key: "number",
      type: "number",
      default: "16",
      scope: "app",
      section: "validation-types.section",
      label: "Number",
      description: "A number setting."
    };

    expect(definition.default).toBe("16");
  });

  it("keeps the SettingType fixture exhaustive", () => {
    expect(exhaustiveSettingTypeFixture("path")).toBe("path");
  });
});
