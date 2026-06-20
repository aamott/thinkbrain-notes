import type { MarkdownFileEntry } from "@thinkbrain/core";
import { describe, expect, it } from "vitest";

import { buildFileTree, type FileTreeNode } from "./fileTreeModel";

function entry(relativePath: string): MarkdownFileEntry {
  const segments = relativePath.split("/");

  return {
    relativePath,
    fileName: segments.at(-1) ?? relativePath,
    parentPath: segments.slice(0, -1).join("/"),
    byteSize: 0,
    updatedAt: null
  };
}

function childNames(nodes: readonly FileTreeNode[]): string[] {
  return nodes.map((node) => node.name);
}

describe("buildFileTree", () => {
  it("nests files under inferred folders", () => {
    const tree = buildFileTree([
      entry("Projects/Alpha/Notes.md"),
      entry("Inbox.md")
    ]);

    const projects = tree.find((node) => node.name === "Projects");
    expect(projects?.kind).toBe("folder");
    const alpha = projects?.children?.[0];
    expect(alpha?.name).toBe("Alpha");
    expect(alpha?.kind).toBe("folder");
    expect(alpha?.children?.[0]).toMatchObject({
      name: "Notes.md",
      kind: "file",
      path: "Projects/Alpha/Notes.md"
    });
  });

  it("orders folders before files, each alphabetically (case-insensitive)", () => {
    const tree = buildFileTree([
      entry("zebra.md"),
      entry("Apple.md"),
      entry("beta/inner.md"),
      entry("Alpha/inner.md")
    ]);

    // Folders (Alpha, beta) come first, then files (Apple.md, zebra.md).
    expect(childNames(tree)).toEqual(["Alpha", "beta", "Apple.md", "zebra.md"]);
  });

  it("gives folders and files stable, distinct ids", () => {
    const tree = buildFileTree([entry("docs/guide.md")]);

    expect(tree[0]?.id).toBe("folder:docs");
    expect(tree[0]?.children?.[0]?.id).toBe("docs/guide.md");
  });

  it("returns an empty tree for no files", () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it("reuses a shared folder for sibling files", () => {
    const tree = buildFileTree([entry("notes/a.md"), entry("notes/b.md")]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toHaveLength(2);
    expect(childNames(tree[0]?.children ?? [])).toEqual(["a.md", "b.md"]);
  });
});
