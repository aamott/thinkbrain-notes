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

  /**
   * An extension's activation scope owns everything it registers, so a tab
   * contribution has to be revocable like a command or a panel.
   */
  it("returns a handle that unregisters the contribution", () => {
    const registry = createTabRegistry();
    const registration = { kind: "extension.calendar", label: "Calendar", isAvailable: true };

    const handle = registry.register(registration);
    handle.dispose();

    expect(registry.get("extension.calendar")).toBeUndefined();
    expect(registry.entries()).toEqual([]);
  });

  it("permits re-registration after disposal and ignores a repeated dispose", () => {
    const registry = createTabRegistry();
    const handle = registry.register({ kind: "extension.calendar", label: "Calendar", isAvailable: true });

    handle.dispose();
    handle.dispose();
    const second = registry.register({ kind: "extension.calendar", label: "Calendar v2", isAvailable: true });

    expect(registry.get("extension.calendar")?.label).toBe("Calendar v2");
    second.dispose();
  });

  it("rejects ambiguous duplicate renderers", () => {
    const registry = createTabRegistry();
    registry.register({ kind: "editor", label: "Editor", isAvailable: true });

    expect(() =>
      registry.register({ kind: "editor", label: "Other editor", isAvailable: true })
    ).toThrow("already registered");
  });
});
