import { describe, expect, it } from "vitest";

import { builtInDesktopCommands } from "./commandRegistry";
import {
  filterDesktopCommands,
  getCommandPaletteResults,
  handleCommandPaletteKey,
  initialCommandPaletteState,
  setCommandPaletteQuery
} from "./commandPaletteModel";

describe("command palette filtering", () => {
  it("filters case-insensitively with deterministic title-prefix ranking", () => {
    expect(filterDesktopCommands(builtInDesktopCommands, "TOGGLE").map((command) => command.id)).toEqual([
      "toggle-theme", "toggle-explorer", "toggle-outline", "toggle-assistant", "toggle-bottom-panel"
    ]);
    expect(filterDesktopCommands(builtInDesktopCommands, "git").map((command) => command.id)).toEqual([
      "open-source-control"
    ]);
  });

  it("exposes an explicit empty state and clamps a stale active index", () => {
    expect(getCommandPaletteResults({ query: "not a command", activeIndex: 8 }, builtInDesktopCommands, [])).toMatchObject({
      status: "empty",
      activeIndex: 0,
      activeItem: null
    });
    expect(getCommandPaletteResults({ query: "open", activeIndex: 8 }, builtInDesktopCommands, []).activeIndex).toBe(4);
  });

  it("resets selection when changing the query", () => {
    expect(setCommandPaletteQuery("notes")).toEqual({ query: "notes", activeIndex: 0 });
  });
});

describe("command palette keyboard decisions", () => {
  it("wraps arrow navigation and handles Home and End", () => {
    const state = { ...initialCommandPaletteState, query: "toggle" };

    expect(handleCommandPaletteKey(state, builtInDesktopCommands, [], "ArrowUp").state.activeIndex).toBe(4);
    expect(handleCommandPaletteKey(state, builtInDesktopCommands, [], "ArrowDown").state.activeIndex).toBe(1);
    expect(handleCommandPaletteKey({ ...state, activeIndex: 3 }, builtInDesktopCommands, [], "Home").state.activeIndex).toBe(0);
    expect(handleCommandPaletteKey(state, builtInDesktopCommands, [], "End").state.activeIndex).toBe(4);
  });

  it("emits execute for the active command and close for Escape", () => {
    const state = { ...initialCommandPaletteState, query: "new" };

    expect(handleCommandPaletteKey(state, builtInDesktopCommands, [], "Enter")).toMatchObject({
      type: "execute",
      item: { command: { id: "new-note" } }
    });
    expect(handleCommandPaletteKey(state, builtInDesktopCommands, [], "Escape")).toMatchObject({ type: "close" });
  });

  it("does not execute or navigate when there are no results", () => {
    const state = { query: "missing", activeIndex: 4 };

    expect(handleCommandPaletteKey(state, builtInDesktopCommands, [], "Enter")).toMatchObject({ type: "none" });
    expect(handleCommandPaletteKey(state, builtInDesktopCommands, [], "ArrowDown")).toMatchObject({
      type: "none",
      state: { query: "missing", activeIndex: 0 }
    });
  });
});
