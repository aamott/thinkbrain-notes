import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

describe("semantic theme tokens", () => {
  it("defines the shared chrome token set for light and dark themes", () => {
    const requiredTokens = [
      "--tn-color-titlebar",
      "--tn-color-activitybar",
      "--tn-color-sidebar",
      "--tn-color-editor",
      "--tn-color-panel",
      "--tn-color-statusbar",
      "--tn-color-tab-active",
      "--tn-color-tab-inactive",
      "--tn-duration-overlay"
    ];

    for (const token of requiredTokens) {
      expect(tokens).toContain(token);
    }

    expect(tokens).toMatch(/:root\[data-thinkbrain-theme="light"\]/);
    expect(tokens).toMatch(/:root\[data-thinkbrain-theme="dark"\]/);
  });

  it("defines the overlay slide class consumed by Drawer, BottomSheet, and Scrim", () => {
    expect(tokens).toMatch(/\.tn-slide\s*\{/);
  });
});
