import { describe, expect, it } from "vitest";

import { builtInDesktopCommands, createDesktopCommandRegistry } from "./commandRegistry";

describe("desktop command registry", () => {
  it("provides the shell commands needed by the command palette", () => {
    const registry = createDesktopCommandRegistry();

    expect(registry.entries().map((command) => command.id)).toEqual([
      "open-file", "new-note", "search", "toggle-theme", "toggle-explorer",
      "toggle-outline", "toggle-assistant", "toggle-bottom-panel", "open-settings",
      "rebuild-index", "open-graph", "open-source-control", "open-extensions"
    ]);
    expect(registry.get("toggle-explorer")?.intent).toEqual({ type: "toggle-panel", panel: "explorer" });
    expect(registry.get("rebuild-index")?.availability).toBe("available");
  });

  it("makes feature-owned commands explicitly unavailable with their prerequisite", () => {
    const unavailable = builtInDesktopCommands.filter((command) => command.availability === "unavailable");

    expect(unavailable).toHaveLength(3);
    expect(unavailable).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "open-graph", prerequisite: "link indexing" }),
      expect.objectContaining({ id: "open-source-control", prerequisite: "source-control integration" }),
      expect.objectContaining({ id: "open-extensions", prerequisite: "extension host" })
    ]));
    expect(unavailable.every((command) => Boolean(command.unavailableMessage))).toBe(true);
  });

  it("accepts renderer-neutral extension commands and preserves single ownership", () => {
    const registry = createDesktopCommandRegistry([]);
    const command = {
      id: "extension.calendar",
      title: "Open calendar",
      intent: { type: "open-calendar" },
      availability: "available" as const
    };

    registry.register(command);

    expect(registry.get(command.id)).toEqual(command);
    expect(() => registry.register(command)).toThrow("already registered");
  });
});

