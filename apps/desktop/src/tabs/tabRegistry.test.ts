import { describe, expect, it } from "vitest";

import { createDesktopTabRegistry } from "./tabRegistry";

describe("desktop tab registry", () => {
  it("provides supported first-party views and explicit unavailable views", () => {
    const registry = createDesktopTabRegistry();

    expect(registry.get("editor")).toMatchObject({ isAvailable: true, availability: "available" });
    expect(registry.get("preview")).toMatchObject({ isAvailable: true, availability: "available" });
    expect(registry.get("settings")).toMatchObject({ isAvailable: true, availability: "available" });
    expect(registry.get("graph")).toMatchObject({ isAvailable: false, availability: "unavailable" });
    expect(registry.get("browser")?.unavailableMessage).toContain("unavailable");
  });

  it("accepts a renderer-neutral extension contribution and rejects duplicate ownership", () => {
    const registry = createDesktopTabRegistry([]);
    const extension = {
      kind: "extension.calendar",
      label: "Calendar",
      isAvailable: true,
      availability: "available" as const
    };

    registry.register(extension);

    expect(registry.get(extension.kind)).toEqual(extension);
    expect(() => registry.register(extension)).toThrow("already registered");
  });
});
