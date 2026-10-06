import { describe, expect, it } from "vitest";

import { createSettingsRegistry } from "../registry";
import { validateSettings } from "../validation";
import { uiModule } from "./ui";

describe("uiModule", () => {
  it("registers the desktop workspace selector placement", () => {
    const registry = createSettingsRegistry();
    registry.register(uiModule);

    const definition = registry.getDefinition("ui.workspaceSelectorPlacement");

    expect(definition?.default).toBe("title bar");
    expect(definition?.options).toEqual(["title bar", "panel headers"]);
    expect(definition?.section).toBe("ui.desktop");
  });

  it("registers the floating-bubble labels toggle under ui.mobileBubbleLabels", () => {
    const registry = createSettingsRegistry();
    registry.register(uiModule);

    const definition = registry.getDefinition("ui.mobileBubbleLabels");

    expect(definition?.type).toBe("boolean");
    expect(definition?.default).toBe(false);
    expect(definition?.section).toBe("ui.mobile");
  });

  it("accepts booleans and rejects other shapes", () => {
    const registry = createSettingsRegistry();
    registry.register(uiModule);

    const errorsFor = (value: unknown): readonly unknown[] =>
      validateSettings(registry, { "ui.mobileBubbleLabels": value });

    expect(errorsFor(false)).toHaveLength(0);
    expect(errorsFor(true)).toHaveLength(0);
    expect(errorsFor("yes")).toHaveLength(1);
  });
});
