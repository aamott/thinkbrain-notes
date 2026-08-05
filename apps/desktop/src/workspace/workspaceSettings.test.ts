import { describe, expect, it, vi } from "vitest";

// Mock the native bridge so the helper tests stay pure-TS and never reach Tauri.
const invokeNativeCommand = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();
vi.mock("../native/commands", () => ({
  invokeNativeCommand: (command: string, args: Record<string, unknown>) => invokeNativeCommand(command, args)
}));

import {
  DEFAULT_WORKSPACE_SETTINGS,
  parseWorkspaceSettings,
  readWorkspaceSettings,
  writeWorkspaceSettings
} from "./workspaceSettings";

describe("workspaceSettings", () => {
  it("uses defaults for missing, malformed, and non-boolean documents", () => {
    expect(parseWorkspaceSettings(null)).toEqual(DEFAULT_WORKSPACE_SETTINGS);
    expect(parseWorkspaceSettings(undefined)).toEqual(DEFAULT_WORKSPACE_SETTINGS);
    expect(parseWorkspaceSettings("{not json")).toEqual(DEFAULT_WORKSPACE_SETTINGS);
    expect(parseWorkspaceSettings(JSON.stringify({ showHidden: "yes" }))).toEqual(DEFAULT_WORKSPACE_SETTINGS);
    expect(parseWorkspaceSettings(JSON.stringify({ unrelated: 1 }))).toEqual(DEFAULT_WORKSPACE_SETTINGS);
  });

  it("preserves an explicit boolean preference", () => {
    expect(parseWorkspaceSettings(JSON.stringify({ showHidden: true }))).toEqual({ showHidden: true });
    expect(parseWorkspaceSettings(JSON.stringify({ showHidden: false }))).toEqual({ showHidden: false });
  });

  it("reads settings through the native bridge and falls back to defaults on null", async () => {
    invokeNativeCommand.mockResolvedValueOnce(JSON.stringify({ showHidden: true }));
    await expect(readWorkspaceSettings("/notes")).resolves.toEqual({ showHidden: true });
    expect(invokeNativeCommand).toHaveBeenCalledWith("read_workspace_settings", { rootPath: "/notes" });

    invokeNativeCommand.mockResolvedValueOnce(null);
    await expect(readWorkspaceSettings("/notes")).resolves.toEqual(DEFAULT_WORKSPACE_SETTINGS);
  });

  it("writes settings as a JSON string through the native bridge", async () => {
    invokeNativeCommand.mockResolvedValueOnce(undefined);
    await writeWorkspaceSettings("/notes", { showHidden: true });
    expect(invokeNativeCommand).toHaveBeenCalledWith("write_workspace_settings", {
      rootPath: "/notes",
      contents: JSON.stringify({ showHidden: true })
    });
  });
});
