import { describe, expect, it } from "vitest";

import { createSettingsRegistry } from "../registry";
import { validateSettings } from "../validation";
import { uiModule } from "./ui";

describe("uiModule", () => {
  it("registers the hub under the full key ui.mobileHub", () => {
    const registry = createSettingsRegistry();
    registry.register(uiModule);

    const definition = registry.getDefinition("ui.mobileHub");

    expect(definition?.type).toBe("string");
    // Empty means "use the built-in defaults", which live in the desktop layer
    // so that panel ids stay out of platform-agnostic core.
    expect(definition?.default).toBe("");
  });

  it("accepts the empty sentinel and a JSON list, and rejects other shapes", () => {
    const registry = createSettingsRegistry();
    registry.register(uiModule);

    const errorsFor = (value: unknown): readonly unknown[] =>
      validateSettings(registry, { "ui.mobileHub": value });

    expect(errorsFor("")).toHaveLength(0);
    expect(errorsFor('[{"kind":"menu"}]')).toHaveLength(0);
    expect(errorsFor("{}")).toHaveLength(1);
    expect(errorsFor("not json")).toHaveLength(1);
  });
});
