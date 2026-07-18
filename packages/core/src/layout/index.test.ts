import { describe, expect, it } from "vitest";

import { createTabRegistry } from "./index";

describe("tab registry", () => {
  it("keeps platform-neutral tab contribution metadata", () => {
    const registry = createTabRegistry();
    const registration = {
      kind: "extension.calendar",
      label: "Calendar",
      isAvailable: true
    };

    registry.register(registration);

    expect(registry.get("extension.calendar")).toEqual(registration);
    expect(registry.entries()).toEqual([registration]);
  });

  it("rejects ambiguous duplicate renderers", () => {
    const registry = createTabRegistry();
    registry.register({ kind: "editor", label: "Editor", isAvailable: true });

    expect(() =>
      registry.register({ kind: "editor", label: "Other editor", isAvailable: true })
    ).toThrow("already registered");
  });
});
