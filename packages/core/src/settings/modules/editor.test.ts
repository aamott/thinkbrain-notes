import { describe, expect, it } from "vitest";
import { createSettingsRegistry } from "../registry";
import { validateSettings } from "../validation";
import { editorModule } from "./editor";

describe("editor tab settings", () => {
  const registry = createSettingsRegistry();
  registry.register(editorModule);

  it("registers app-scoped cycling with tab order as the default and an explicit MRU stub", () => {
    expect(registry.getDefinition("editor.tabCycleOrder")).toMatchObject({
      type: "enum",
      options: ["tab order", "last visited"],
      default: "tab order",
      scope: "app",
      section: "editor.tabs"
    });
    expect(registry.getDefinition("editor.tabCycleOrder")?.description).toContain("not yet implemented");
  });

  it("accepts both registered modes and rejects unknown modes", () => {
    expect(validateSettings(registry, { "editor.tabCycleOrder": "tab order" })).toEqual([]);
    expect(validateSettings(registry, { "editor.tabCycleOrder": "last visited" })).toEqual([]);
    expect(validateSettings(registry, { "editor.tabCycleOrder": "random" })).toHaveLength(1);
  });
});
