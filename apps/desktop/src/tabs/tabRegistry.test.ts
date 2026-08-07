import { describe, expect, it, vi } from "vitest";

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

describe("contributed tab renderers", () => {
  const calendar = {
    kind: "journal.calendar",
    label: "Calendar",
    isAvailable: true,
    availability: "available" as const
  };

  it("returns a handle that unregisters the view", () => {
    const registry = createDesktopTabRegistry([]);

    const handle = registry.register(calendar);
    handle.dispose();

    expect(registry.get(calendar.kind)).toBeUndefined();
    expect(registry.entries()).toEqual([]);
  });

  it("frees the kind for a later owner", () => {
    const registry = createDesktopTabRegistry([]);
    registry.register(calendar).dispose();

    expect(() => registry.register({ ...calendar, label: "Calendar v2" })).not.toThrow();
    expect(registry.get(calendar.kind)?.label).toBe("Calendar v2");
  });

  /**
   * Without a factory the shell has no way to draw a contributed kind, and an
   * unknown kind falls through to the Markdown editor branch.
   */
  it("carries a renderer factory the shell can invoke", () => {
    const registry = createDesktopTabRegistry([]);
    const factory = vi.fn(() => "calendar view");

    registry.register({ ...calendar, factory });

    expect(registry.get(calendar.kind)?.factory).toBe(factory);
  });

  it("notifies subscribers when a view is registered or disposed", () => {
    const registry = createDesktopTabRegistry([]);
    const seen: number[] = [];
    registry.subscribe(() => seen.push(registry.entries().length));

    registry.register(calendar).dispose();

    expect(seen).toEqual([1, 0]);
  });
});
