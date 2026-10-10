import { describe, expect, it } from "vitest";
import {
  builtInDesktopPanels,
  desktopPanelRegistry,
  isBuiltInLeftPanel
} from "../panels/panelRegistryModel";
import { isSelectableLeftPanel, isSelectableRightPanel } from "./shellTypes";

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

describe("isSelectableLeftPanel", () => {
  it("accepts a registered built-in left panel", () => {
    expect(isSelectableLeftPanel("explorer")).toBe(true);
  });

  it("accepts a registered extension-owned left panel", () => {
    desktopPanelRegistry.register({
      id: "shelltypes-test.journal",
      label: "Journal",
      icon: "x",
      side: "left",
      factory: () => null
    });

    expect(isSelectableLeftPanel("shelltypes-test.journal")).toBe(true);
  });

  it("rejects an id nobody registered, and a right-side id", () => {
    expect(isSelectableLeftPanel("exlorer")).toBe(false);
    expect(isSelectableLeftPanel("nonexistent.panel")).toBe(false);
    expect(isSelectableLeftPanel("outline")).toBe(false);
  });
});

describe("isBuiltInLeftPanel", () => {
  // The guard is a literal list duplicating the built-in table's left-side
  // ids; this parity check keeps a drift between them from going unnoticed.
  it("admits exactly the built-in table's left-side ids", () => {
    for (const panel of builtInDesktopPanels) {
      expect(isBuiltInLeftPanel(panel.id), panel.id).toBe(panel.side === "left");
    }
  });
});
