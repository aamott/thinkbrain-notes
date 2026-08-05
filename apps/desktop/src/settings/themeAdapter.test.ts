// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Theme adapter tests.
 *
 * The adapter has two branches: a Tauri branch that delegates to
 * `invokeNativeCommand("list_themes")`, and a non-Tauri branch that returns an
 * empty array. `isTauri()` from `@tauri-apps/api/core` is mocked per-test to
 * exercise each branch, and `invokeNativeCommand` is mocked so no real IPC
 * call is made.
 */

// Mock the Tauri core `isTauri` check so we can toggle the branch under test.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn<() => boolean>()
}));

// Mock the native bridge so no real IPC invocation happens. The mock
// implementation is reset per test and overridden as needed.
vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn()
}));

import { isTauri } from "@tauri-apps/api/core";
import { invokeNativeCommand } from "../native/commands";
import { listThemes, type ThemeEntry } from "./themeAdapter";

beforeEach(() => {
  vi.mocked(isTauri).mockReset();
  vi.mocked(invokeNativeCommand).mockReset();
});

describe("listThemes", () => {
  it("returns an empty array in non-Tauri contexts (no native bridge)", async () => {
    vi.mocked(isTauri).mockReturnValue(false);

    const result = await listThemes();

    expect(result).toEqual([]);
    // The native command must NOT be invoked outside Tauri.
    expect(invokeNativeCommand).not.toHaveBeenCalled();
  });

  it("delegates to invokeNativeCommand('list_themes') in Tauri contexts", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const nativeEntries: readonly ThemeEntry[] = [
      { name: "Forest Dark", path: "/app-data/themes/forest-dark.tbtheme.json" },
      { name: "Solarized Light", path: "/app-data/themes/solarized-light.tbtheme.json" }
    ];
    vi.mocked(invokeNativeCommand).mockResolvedValue(nativeEntries);

    const result = await listThemes();

    expect(invokeNativeCommand).toHaveBeenCalledTimes(1);
    expect(invokeNativeCommand).toHaveBeenCalledWith("list_themes");
    expect(result).toBe(nativeEntries);
  });

  it("returns the native result unchanged (no per-entry copy)", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const nativeEntries: readonly ThemeEntry[] = [
      { name: "One Dark Pro", path: "/app-data/themes/one-dark-pro.tbtheme.json" }
    ];
    vi.mocked(invokeNativeCommand).mockResolvedValue(nativeEntries);

    const result = await listThemes();

    // Identity check confirms the adapter does not copy the array.
    expect(result).toBe(nativeEntries);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("One Dark Pro");
  });

  it("propagates native command errors (fail-loud)", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const error = new Error("native bridge down");
    vi.mocked(invokeNativeCommand).mockRejectedValue(error);

    await expect(listThemes()).rejects.toThrow("native bridge down");
  });
});
