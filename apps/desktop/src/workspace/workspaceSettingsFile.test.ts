import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../native/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../native/commands")>()),
  invokeNativeCommand: vi.fn()
}));

import { invokeNativeCommand, NativeCommandError } from "../native/commands";
import {
  readWorkspaceSettingsDocument,
  updateWorkspaceSettingsDocument
} from "./workspaceSettingsFile";

const invoke = vi.mocked(invokeNativeCommand);

/** A stand-in for the file on disk, so a write is visible to the next read. */
let disk = new Map<string, string>();

beforeEach(() => {
  disk = new Map();
  invoke.mockReset();
  invoke.mockImplementation((async (command: string, args: Record<string, string>) => {
    if (command === "read_workspace_settings") return disk.get(args.rootPath!) ?? null;
    if (command === "write_workspace_settings") {
      disk.set(args.rootPath!, args.contents!);
      return null;
    }
    throw new Error(`unexpected command ${command}`);
  }) as unknown as typeof invokeNativeCommand);
});

const parse = (raw: string | null): Record<string, unknown> =>
  raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);

const patch = (key: string, value: unknown) => (raw: string | null) =>
  JSON.stringify({ ...parse(raw), [key]: value });

describe("the workspace settings document", () => {
  it("reads what was written", async () => {
    await updateWorkspaceSettingsDocument("/vault", patch("showHidden", true));

    expect(parse(await readWorkspaceSettingsDocument("/vault"))).toEqual({ showHidden: true });
  });

  /**
   * The bug this exists to prevent: two writers each read, merge their own key
   * and write back. Interleaved, the second revises a document the first has
   * already replaced, and the first writer's key is gone — which is how the
   * journal's field definitions disappeared on restart.
   */
  it("shows each writer the previous writer's result", async () => {
    await Promise.all([
      updateWorkspaceSettingsDocument("/vault", patch("showHidden", true)),
      updateWorkspaceSettingsDocument("/vault", patch("fieldDefinitions", ["mood"]))
    ]);

    expect(parse(disk.get("/vault") ?? null)).toEqual({
      showHidden: true,
      fieldDefinitions: ["mood"]
    });
  });

  it("keeps one workspace's writes from waiting on another's", async () => {
    await Promise.all([
      updateWorkspaceSettingsDocument("/one", patch("showHidden", true)),
      updateWorkspaceSettingsDocument("/two", patch("showHidden", false))
    ]);

    expect(parse(disk.get("/one") ?? null)).toEqual({ showHidden: true });
    expect(parse(disk.get("/two") ?? null)).toEqual({ showHidden: false });
  });

  /** One writer's failure must not strand every writer behind it. */
  it("carries on after an update fails", async () => {
    const failed = updateWorkspaceSettingsDocument("/vault", () => {
      throw new Error("nope");
    });
    const after = updateWorkspaceSettingsDocument("/vault", patch("showHidden", true));

    await expect(failed).rejects.toThrow("nope");
    await expect(after).resolves.toContain("showHidden");
    expect(parse(disk.get("/vault") ?? null)).toEqual({ showHidden: true });
  });

  /**
   * Another window can land a write between this window's read and its own
   * write. The host rejects the stale write rather than letting it through, so
   * the revision has to be recomputed against what is actually there now.
   */
  it("recomputes the revision when another window wrote first", async () => {
    disk.set("/vault", JSON.stringify({ fieldDefinitions: ["mood"] }));
    let interfered = false;
    invoke.mockImplementation((async (command: string, args: Record<string, string>) => {
      if (command === "read_workspace_settings") return disk.get(args.rootPath!) ?? null;
      if (command === "write_workspace_settings") {
        if (!interfered) {
          interfered = true;
          // The other window's write lands, so this one's `expected` is stale.
          disk.set(args.rootPath!, JSON.stringify({ fieldDefinitions: ["mood", "sleep"] }));
          throw new NativeCommandError({
            code: "settings.workspace_conflict",
            message: "The workspace settings changed while this one was being saved."
          });
        }
        disk.set(args.rootPath!, args.contents!);
        return null;
      }
      throw new Error(`unexpected command ${command}`);
    }) as unknown as typeof invokeNativeCommand);

    await updateWorkspaceSettingsDocument("/vault", patch("showHidden", true));

    expect(parse(disk.get("/vault") ?? null)).toEqual({
      fieldDefinitions: ["mood", "sleep"],
      showHidden: true
    });
  });

  it("sends what it read as the write's precondition", async () => {
    disk.set("/vault", JSON.stringify({ showHidden: false }));

    await updateWorkspaceSettingsDocument("/vault", patch("showHidden", true));

    expect(invoke).toHaveBeenCalledWith("write_workspace_settings", {
      rootPath: "/vault",
      contents: JSON.stringify({ showHidden: true }),
      expected: JSON.stringify({ showHidden: false })
    });
  });

  it("gives up rather than retrying a conflict for ever", async () => {
    invoke.mockImplementation((async (command: string, args: Record<string, string>) => {
      if (command === "read_workspace_settings") return disk.get(args.rootPath!) ?? null;
      throw new NativeCommandError({
        code: "settings.workspace_conflict",
        message: "The workspace settings changed while this one was being saved."
      });
    }) as unknown as typeof invokeNativeCommand);

    await expect(
      updateWorkspaceSettingsDocument("/vault", patch("showHidden", true))
    ).rejects.toThrow("changed while this one was being saved");
  });

  it("returns the document it wrote", async () => {
    const written = await updateWorkspaceSettingsDocument("/vault", patch("showHidden", true));

    expect(written).toBe(disk.get("/vault"));
  });
});
