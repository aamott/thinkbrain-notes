import { describe, expect, it } from "vitest";
import { desktopPanelRegistry } from "../panels/panelRegistry";
import { isSelectableRightPanel } from "./shellTypes";

describe("isSelectableRightPanel", () => {
  it("accepts a registered built-in right panel", () => {
    expect(isSelectableRightPanel("outline")).toBe(true);
  });

  it("accepts a registered extension-owned right panel", () => {
    desktopPanelRegistry.register({
      id: "shelltypes-test.stats",
      label: "Stats",
      icon: "x",
      side: "right",
      factory: () => null
    });

    expect(isSelectableRightPanel("shelltypes-test.stats")).toBe(true);
  });

  it("rejects an id nobody registered — a typo or a stale extension id", () => {
    expect(isSelectableRightPanel("exlorer")).toBe(false);
    expect(isSelectableRightPanel("nonexistent.panel")).toBe(false);
  });

  it("rejects a left-side panel id, so revealPanel cannot open the wrong dock", () => {
    expect(isSelectableRightPanel("explorer")).toBe(false);
  });
});
