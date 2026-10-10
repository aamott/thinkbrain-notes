import { describe, expect, it } from "vitest";
import type { NativeKnownWorkspace } from "../native/commands";
import { filterWorkspaces, workspaceRowState } from "./workspaceManagerModel";

function entry(overrides: Partial<NativeKnownWorkspace> = {}): NativeKnownWorkspace {
  return {
    rootPath: "/notes/work",
    name: "Work",
    kind: "external",
    missing: false,
    ...overrides
  };
}

describe("workspaceRowState", () => {
  it("marks the workspace open in this window and blocks every action", () => {
    expect(workspaceRowState(entry(), "/notes/work")).toEqual({
      canOpen: false,
      badge: "current",
      removal: null
    });
  });

  it("lets an existing external workspace open and be forgotten", () => {
    expect(workspaceRowState(entry(), "/notes/other")).toEqual({
      canOpen: true,
      badge: null,
      removal: "forget"
    });
  });

  it("lets an existing managed vault open and be deleted", () => {
    expect(workspaceRowState(entry({ kind: "managed" }), "/notes/other")).toEqual({
      canOpen: true,
      badge: null,
      removal: "delete"
    });
  });

  it("flags a missing folder: unopenable, but forgettable", () => {
    expect(workspaceRowState(entry({ missing: true }), "/notes/other")).toEqual({
      canOpen: false,
      badge: "missing",
      removal: "forget"
    });
  });

  it("forgets a missing managed vault — there is nothing left to delete", () => {
    expect(workspaceRowState(entry({ kind: "managed", missing: true }), null)).toEqual({
      canOpen: false,
      badge: "missing",
      removal: "forget"
    });
  });

  it("marks a root another window shows as open elsewhere — still openable", () => {
    expect(workspaceRowState(entry(), "/notes/current", ["/notes/work"])).toEqual({
      canOpen: true,
      badge: "open_elsewhere",
      removal: "forget"
    });
  });

  it("does not mark the current or a missing workspace as open elsewhere", () => {
    expect(workspaceRowState(entry(), "/notes/work", ["/notes/work"]).badge).toBe("current");
    expect(
      workspaceRowState(entry({ missing: true }), "/notes/current", ["/notes/work"]).badge
    ).toBe("missing");
  });
});

describe("filterWorkspaces", () => {
  const entries = [
    entry({ rootPath: "/notes/work", name: "Work" }),
    entry({ rootPath: "/vaults/Recipes", name: "Recipes", kind: "managed" }),
    entry({ rootPath: "/old/vault", name: "Old Vault", missing: true })
  ];

  it("returns everything for a blank query", () => {
    expect(filterWorkspaces(entries, "  ")).toHaveLength(3);
  });

  it("matches names case-insensitively", () => {
    expect(filterWorkspaces(entries, "recipes").map((e) => e.name)).toEqual(["Recipes"]);
    expect(filterWorkspaces(entries, "OLD")).toEqual([entries[2]]);
  });

  it("matches paths case-insensitively", () => {
    expect(filterWorkspaces(entries, "/VAULTS/")).toEqual([entries[1]]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterWorkspaces(entries, "nope")).toEqual([]);
  });
});
