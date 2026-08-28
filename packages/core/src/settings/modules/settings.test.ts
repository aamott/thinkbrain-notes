import { describe, expect, it } from "vitest";

import { createSettingsRegistry } from "../registry";
import { settingsModule } from "./settings";

describe("settings module", () => {
  it("offers a Show advanced settings toggle that starts off", () => {
    const registry = createSettingsRegistry();
    registry.register(settingsModule);
    const definition = registry.getDefinition("settings.showAdvanced");

    expect(definition?.type).toBe("boolean");
    expect(definition?.default).toBe(false);
  });

  it("does not hide the toggle behind itself", () => {
    const registry = createSettingsRegistry();
    registry.register(settingsModule);

    expect(registry.getDefinition("settings.showAdvanced")?.advanced).toBeUndefined();
  });

  it("keeps `advanced` on a definition through registration", () => {
    const registry = createSettingsRegistry();
    registry.register({
      id: "probe",
      label: "Probe",
      scope: "app",
      sections: [
        {
          id: "probe.general",
          label: "Probe",
          settings: [
            {
              key: "deep",
              type: "boolean",
              default: false,
              scope: "app",
              section: "probe.general",
              label: "Deep",
              description: "A setting most people never need.",
              advanced: true
            }
          ]
        }
      ]
    });

    expect(registry.getDefinition("probe.deep")?.advanced).toBe(true);
  });
});
