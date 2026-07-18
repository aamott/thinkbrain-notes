import { describe, expect, it } from "vitest";
import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";
import {
  buildWorkspaceTree,
  initialWorkspaceExplorerState,
  workspaceExplorerReducer
} from "./workspaceExplorerModel";

const snapshot: NativeWorkspaceSnapshot = {
  workspace: { root_path: "/notes", name: "notes" },
  files: []
};

const entries: readonly NativeWorkspaceEntry[] = [
  { relative_path: "zeta.md", name: "zeta.md", parent_path: "", kind: "file", is_markdown: true, byte_size: 1, updated_at: null },
  { relative_path: "Projects", name: "Projects", parent_path: "", kind: "directory", is_markdown: false, byte_size: 0, updated_at: null },
  { relative_path: "Projects/brief.txt", name: "brief.txt", parent_path: "Projects", kind: "file", is_markdown: false, byte_size: 1, updated_at: null },
  { relative_path: "alpha.md", name: "alpha.md", parent_path: "", kind: "file", is_markdown: true, byte_size: 1, updated_at: null }
];

describe("workspaceExplorerReducer", () => {
  it("keeps cancellation distinct from an open failure", () => {
    const picking = workspaceExplorerReducer(initialWorkspaceExplorerState, { type: "pick" });
    expect(picking.phase).toBe("picking");
    expect(workspaceExplorerReducer(picking, { type: "cancel" }).phase).toBe("cancelled");
    expect(workspaceExplorerReducer(picking, { type: "failed", message: "Unavailable" }).error).toBe("Unavailable");
  });

  it("clears stale data when an error is dismissed", () => {
    const ready = workspaceExplorerReducer(initialWorkspaceExplorerState, { type: "opened", snapshot, entries });
    const failed = workspaceExplorerReducer(ready, { type: "failed", message: "Missing" });

    expect(failed.snapshot).toBeNull();
    expect(failed.entries).toEqual([]);
    expect(workspaceExplorerReducer(failed, { type: "dismiss" })).toEqual(initialWorkspaceExplorerState);
  });

  it("stores only successfully opened workspace data", () => {
    const ready = workspaceExplorerReducer(initialWorkspaceExplorerState, { type: "opened", snapshot, entries });
    expect(ready).toMatchObject({ phase: "ready", snapshot, entries, error: null });
  });
});

describe("buildWorkspaceTree", () => {
  it("sorts folders before files and keeps descendants together", () => {
    const tree = buildWorkspaceTree(entries);
    expect(tree.map((node) => node.entry.name)).toEqual(["Projects", "alpha.md", "zeta.md"]);
    expect(tree[0]?.children.map((node) => node.entry.name)).toEqual(["brief.txt"]);
  });
});
