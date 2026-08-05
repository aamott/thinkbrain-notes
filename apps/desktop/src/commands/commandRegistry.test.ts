import { describe, expect, it, vi } from "vitest";

import {
  builtInDesktopCommands,
  createDesktopCommandRegistry,
  type DesktopCommandContext
} from "./commandRegistry";

const commandContext: DesktopCommandContext = {
  showExplorer: () => undefined,
  focusNewNote: () => undefined,
  openSearch: () => undefined,
  toggleTheme: () => undefined,
  toggleExplorer: () => undefined,
  toggleOutline: () => undefined,
  toggleAssistant: () => undefined,
  toggleBottomPanel: () => undefined,
  openSettings: () => undefined,
  rebuildIndex: () => undefined,
  closePalette: () => undefined
};

describe("desktop command registry", () => {
  it("provides the shell commands needed by the command palette", () => {
    const registry = createDesktopCommandRegistry();

    expect(registry.entries().map((command) => command.id)).toEqual([
      "open-file", "new-note", "search", "toggle-theme", "toggle-explorer",
      "toggle-outline", "toggle-assistant", "toggle-bottom-panel", "open-settings",
      "rebuild-index", "open-graph", "open-source-control", "open-extensions"
    ]);
    expect(registry.get("toggle-explorer")?.intent).toEqual({ type: "toggle-panel", panel: "explorer" });
    expect(registry.get("open-file")?.keybinding).toBe("Ctrl/Cmd+P");
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

  it("executes the typed handler returned by lookup", () => {
    const registry = createDesktopCommandRegistry([]);
    const handler = vi.fn<(context: DesktopCommandContext) => void>();
    const command = {
      id: "extension.calendar",
      title: "Open calendar",
      intent: { type: "open-calendar" },
      availability: "available" as const,
      handler
    };

    registry.register(command);
    registry.get(command.id)?.handler(commandContext);

    expect(handler).toHaveBeenCalledWith(commandContext);
  });

  it("preserves order and rejects duplicate command IDs", () => {
    const registry = createDesktopCommandRegistry([]);
    const first = {
      id: "extension.first",
      title: "First",
      intent: { type: "first" },
      availability: "available" as const,
      handler: () => undefined
    };
    const second = {
      id: "extension.second",
      title: "Second",
      intent: { type: "second" },
      availability: "available" as const,
      handler: () => undefined
    };

    registry.register(first);
    registry.register(second);

    expect(registry.entries().map((entry) => entry.id)).toEqual([
      "extension.first",
      "extension.second"
    ]);
    expect(() => registry.register(first)).toThrow("already registered");
  });
});

