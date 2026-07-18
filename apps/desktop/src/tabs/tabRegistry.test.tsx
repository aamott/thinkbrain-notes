import { describe, expect, it } from "vitest";

import { createDesktopTabRegistry } from "./tabRegistry";

describe("desktop tab registry", () => {
  it("keeps React renderers in desktop while supporting extension contributions", () => {
    const registry = createDesktopTabRegistry([
      {
        kind: "extension.calendar",
        label: "Calendar",
        isAvailable: true,
        render: () => null
      }
    ]);

    expect(registry.get("editor")?.isAvailable).toBe(true);
    expect(registry.get("graph")?.isAvailable).toBe(false);
    expect(registry.get("extension.calendar")?.label).toBe("Calendar");
  });

  it("does not allow extensions to replace a first-party kind", () => {
    expect(() =>
      createDesktopTabRegistry([
        { kind: "editor", label: "Replacement", isAvailable: true, render: () => null }
      ])
    ).toThrow("already registered");
  });
});
