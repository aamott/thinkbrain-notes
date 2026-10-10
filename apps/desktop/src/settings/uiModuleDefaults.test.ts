import { describe, expect, it } from "vitest";
import { uiModule } from "@thinkbrain/core";

import { MOBILE_UI_SCALE, uiModuleForFormFactor } from "./uiModuleDefaults";

const scaleDefault = (coarse: boolean) =>
  uiModuleForFormFactor(coarse).sections
    .flatMap((section) => section.settings ?? [])
    .find((setting) => setting.key === "scale")?.default;

describe("uiModuleForFormFactor", () => {
  it("raises the interface-size default on coarse pointers", () => {
    expect(scaleDefault(true)).toBe(MOBILE_UI_SCALE);
  });

  it("keeps the desktop default on fine pointers", () => {
    expect(scaleDefault(false)).toBe(100);
  });

  it("leaves the rest of the module untouched", () => {
    const mobile = uiModuleForFormFactor(true);
    expect(mobile.sections.map((section) => section.id)).toEqual(
      uiModule.sections.map((section) => section.id)
    );
    for (const section of mobile.sections) {
      for (const setting of section.settings ?? []) {
        if (setting.key === "scale") continue;
        const original = uiModule.sections
          .flatMap((candidate) => candidate.settings ?? [])
          .find((candidate) => candidate.key === setting.key);
        expect(setting).toBe(original);
      }
    }
  });
});
