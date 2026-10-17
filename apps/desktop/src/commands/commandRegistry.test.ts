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
  toggleLivePreview: () => undefined,
  moveTabLeft: () => undefined,
  moveTabRight: () => undefined,
  revealPanel: () => undefined,
  revealLeftPanel: () => undefined,
  openSettings: () => undefined,
  goBack: () => undefined,
  goForward: () => undefined,
  closePalette: () => undefined
};

describe("desktop command registry", () => {
  it("runs tab movement through the shell and closes the palette", () => {
    const moveTabLeft = vi.fn();
    const moveTabRight = vi.fn();
    const closePalette = vi.fn();
    const context = { ...commandContext, moveTabLeft, moveTabRight, closePalette };
    const registry = createDesktopCommandRegistry();
    registry.get("move-tab-left")?.handler(context);
    registry.get("move-tab-right")?.handler(context);
    expect(moveTabLeft).toHaveBeenCalledOnce();
    expect(moveTabRight).toHaveBeenCalledOnce();
    expect(closePalette).toHaveBeenCalledTimes(2);
  });
  it("provides the shell commands needed by the command palette", () => {
    const registry = createDesktopCommandRegistry();

    expect(registry.entries().map((command) => command.id)).toEqual([
      "move-tab-left", "move-tab-right",
      "new-note", "search", "go-back", "go-forward",
      "toggle-live-preview", "toggle-theme",
      "toggle-explorer", "toggle-outline", "toggle-assistant", "toggle-bottom-panel",
      "open-settings", "open-graph", "open-extensions"
    ]);
    expect(registry.get("toggle-explorer")?.title).toBe("Toggle Files");
    expect(registry.get("search")?.keybinding).toBe("Ctrl/Cmd+Shift+F");
    expect(registry.get("open-extensions")?.availability).toBe("available");
  });

  it("makes the unimplemented command explicitly unavailable with a message", () => {
    const unavailable = builtInDesktopCommands.filter((command) => command.availability === "unavailable");

    expect(unavailable).toEqual([
      expect.objectContaining({ id: "open-graph" })
    ]);
    expect(unavailable.every((command) => Boolean(command.unavailableMessage))).toBe(true);
  });

  it("executes the typed handler returned by lookup", () => {
    const registry = createDesktopCommandRegistry([]);
    const handler = vi.fn<(context: DesktopCommandContext) => void>();
    const command = {
      id: "extension.calendar",
      title: "Open calendar",
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
      availability: "available" as const,
      handler: () => undefined
    };
    const second = {
      id: "extension.second",
      title: "Second",
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
