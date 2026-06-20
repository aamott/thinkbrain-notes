import { describe, expect, it } from "vitest";

import { appIdentity, designTokenNames } from "./index";

describe("core scaffold exports", () => {
  it("exposes stable application identity", () => {
    expect(appIdentity).toEqual({
      displayName: "Thinkbrain Notes",
      desktopAppId: "com.thinkbrain.notes"
    });
  });

  it("keeps design token names as CSS custom property names", () => {
    expect(designTokenNames.colorBackground).toBe("--tn-color-background");
  });
});
