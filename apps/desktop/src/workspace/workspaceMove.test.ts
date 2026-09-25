import { describe, expect, it } from "vitest";

import {
  isInvalidWorkspaceMove,
  remapExpandedFolders,
  remapMovedPath,
  workspaceMoveDestination
} from "./workspaceMove";

const file = (relativePath: string, name = relativePath.split("/").at(-1) ?? relativePath) => ({
  kind: "file" as const,
  relative_path: relativePath,
  parent_path: relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "",
  name
});

const folder = (relativePath: string) => ({ ...file(relativePath), kind: "directory" as const });

describe("workspaceMoveDestination", () => {
  it("joins the entry name onto the destination parent", () => {
    expect(workspaceMoveDestination({ name: "note.md" }, "Folder")).toBe("Folder/note.md");
  });

  it("uses the bare name for a move to the workspace root", () => {
    expect(workspaceMoveDestination({ name: "note.md" }, "")).toBe("note.md");
  });
});

describe("isInvalidWorkspaceMove", () => {
  it("treats a drop on the current parent as a no-op", () => {
    expect(isInvalidWorkspaceMove(file("Folder/a.md"), "Folder")).toBe(true);
    expect(isInvalidWorkspaceMove(file("a.md"), "")).toBe(true);
    expect(isInvalidWorkspaceMove(folder("Folder"), "")).toBe(true);
  });

  it("accepts a file dropped into any other folder", () => {
    expect(isInvalidWorkspaceMove(file("a.md"), "Folder")).toBe(false);
    expect(isInvalidWorkspaceMove(file("Folder/a.md"), "")).toBe(false);
  });

  it("rejects a folder dropped into itself or a descendant", () => {
    expect(isInvalidWorkspaceMove(folder("Folder"), "Folder")).toBe(true);
    expect(isInvalidWorkspaceMove(folder("Folder"), "Folder/sub")).toBe(true);
    expect(isInvalidWorkspaceMove(folder("Folder"), "Folder/sub/deep")).toBe(true);
  });

  it("does not confuse sibling prefixes: `ab` is not inside `a`", () => {
    expect(isInvalidWorkspaceMove(folder("a"), "ab")).toBe(false);
    expect(isInvalidWorkspaceMove(folder("a"), "ab/sub")).toBe(false);
  });

  it("lets a folder move to the root or an unrelated folder", () => {
    expect(isInvalidWorkspaceMove(folder("Folder/Sub"), "")).toBe(false);
    expect(isInvalidWorkspaceMove(folder("Folder"), "Other")).toBe(false);
  });
});

describe("remapMovedPath", () => {
  it("moves the exact path and descendants, preserving unrelated paths", () => {
    expect(remapMovedPath("a", "a", "b/a")).toBe("b/a");
    expect(remapMovedPath("a/note.md", "a", "b/a")).toBe("b/a/note.md");
    expect(remapMovedPath("ab/note.md", "a", "b/a")).toBe("ab/note.md");
    expect(remapMovedPath("other", "a", "b/a")).toBe("other");
  });

  it("passes null through and ignores no-op prefixes", () => {
    expect(remapMovedPath(null, "a", "b")).toBeNull();
    expect(remapMovedPath("a", "a", "a")).toBe("a");
  });
});

describe("remapExpandedFolders", () => {
  it("keeps a moved folder and its expanded children expanded", () => {
    const expanded = new Set(["a", "a/sub", "other"]);
    expect(remapExpandedFolders(expanded, "a", "b/a")).toEqual(new Set(["b/a", "b/a/sub", "other"]));
  });
});
