import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../native/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../native/commands")>()),
  invokeNativeCommand: vi.fn()
}));

import { invokeNativeCommand, NativeCommandError } from "../native/commands";
import { readAppSettingsDocument, updateAppSettingsDocument } from "./appSettingsFile";

const invoke = vi.mocked(invokeNativeCommand);

/** A stand-in for the app-settings file on disk, so a write is visible to the next read. */
let disk: string | null = null;

beforeEach(() => {
  disk = null;
  invoke.mockReset();
  invoke.mockImplementation((async (command: string, args?: Record<string, string>) => {
    if (command === "read_app_settings") return disk;
    if (command === "write_app_settings") {
      disk = args!.contents!;
      return null;
    }
    throw new Error(`unexpected command ${command}`);
  }) as unknown as typeof invokeNativeCommand);
});

const parse = (raw: string | null): Record<string, unknown> =>
  raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);

const patch = (key: string, value: unknown) => (raw: string | null) =>
  JSON.stringify({ ...parse(raw), [key]: value });

describe("the app settings document", () => {
  it("reads what was written", async () => {
    await updateAppSettingsDocument(patch("appearance.theme", "dark"));

    expect(parse(await readAppSettingsDocument())).toEqual({ "appearance.theme": "dark" });
  });

  /**
   * The bug this exists to prevent: `update_desktop_state` lands (a tab opens)
   * between the store's read and its write, so a save must not revise a copy
   * that write has already superseded — that is how a save reverted every
   * desktop-state change made since the app started.
   */
  it("shows each writer the previous writer's result", async () => {
    await Promise.all([
      updateAppSettingsDocument(patch("appearance.theme", "dark")),
      updateAppSettingsDocument(patch("desktopState", { openTabs: ["a"] }))
    ]);

    expect(parse(disk)).toEqual({
      "appearance.theme": "dark",
      desktopState: { openTabs: ["a"] }
    });
  });

  /** One writer's failure must not strand every writer behind it. */
  it("carries on after an update fails", async () => {
    const failed = updateAppSettingsDocument(() => {
      throw new Error("nope");
    });
    const after = updateAppSettingsDocument(patch("appearance.theme", "dark"));

    await expect(failed).rejects.toThrow("nope");
    await expect(after).resolves.toContain("appearance.theme");
    expect(parse(disk)).toEqual({ "appearance.theme": "dark" });
  });

  /**
   * Another writer — `update_desktop_state`, `update_app_theme`, or another
   * window's save — can land between this write's read and its own write. The
   * host rejects the stale write rather than letting it through, so the
   * revision has to be recomputed against what is actually there now.
   */
  it("recomputes the revision when another writer landed first", async () => {
    disk = JSON.stringify({ desktopState: { openTabs: ["a"] } });
    let interfered = false;
    invoke.mockImplementation((async (command: string, args?: Record<string, string>) => {
      if (command === "read_app_settings") return disk;
      if (command === "write_app_settings") {
        if (!interfered) {
          interfered = true;
          // `update_desktop_state` lands, so this write's `expected` is stale.
          disk = JSON.stringify({ desktopState: { openTabs: ["a", "b"] } });
          throw new NativeCommandError({
            code: "settings.app_conflict",
            message: "The application settings changed while this one was being saved."
          });
        }
        disk = args!.contents!;
        return null;
      }
      throw new Error(`unexpected command ${command}`);
    }) as unknown as typeof invokeNativeCommand);

    await updateAppSettingsDocument(patch("appearance.theme", "dark"));

    expect(parse(disk)).toEqual({
      desktopState: { openTabs: ["a", "b"] },
      "appearance.theme": "dark"
    });
  });

  it("sends what it read as the write's precondition", async () => {
    disk = JSON.stringify({ "appearance.theme": "light" });

    await updateAppSettingsDocument(patch("appearance.theme", "dark"));

    expect(invoke).toHaveBeenCalledWith("write_app_settings", {
      contents: JSON.stringify({ "appearance.theme": "dark" }),
      expected: JSON.stringify({ "appearance.theme": "light" })
    });
  });

  it("gives up rather than retrying a conflict for ever", async () => {
    invoke.mockImplementation((async (command: string) => {
      if (command === "read_app_settings") return disk;
      throw new NativeCommandError({
        code: "settings.app_conflict",
        message: "The application settings changed while this one was being saved."
      });
    }) as unknown as typeof invokeNativeCommand);

    await expect(
      updateAppSettingsDocument(patch("appearance.theme", "dark"))
    ).rejects.toThrow("changed while this one was being saved");
  });

  it("returns the document it wrote", async () => {
    const written = await updateAppSettingsDocument(patch("appearance.theme", "dark"));

    expect(written).toBe(disk);
  });
});
