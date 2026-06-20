import type { WorkspaceEntry } from "@thinkbrain/core";
import { describe, expect, it } from "vitest";

import { buildFileTree, type FileTreeNode } from "./fileTreeModel";

function fileEntry(relativePath: string): WorkspaceEntry {
  const name = relativePath.split("/").at(-1) ?? relativePath;

  return {
    relativePath,
    name,
    parentPath: relativePath.split("/").slice(0, -1).join("/"),
    kind: "file",
    isMarkdown: /\.(md|markdown)$/i.test(name),
    byteSize: 0,
    updatedAt: null
  };
}

function dirEntry(relativePath: string): WorkspaceEntry {
  return {
    relativePath,
    name: relativePath.split("/").at(-1) ?? relativePath,
    parentPath: relativePath.split("/").slice(0, -1).join("/"),
    kind: "directory",
    isMarkdown: false,
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
      fileEntry("Projects/Alpha/Notes.md"),
      fileEntry("Inbox.md")
    ]);

    const projects = tree.find((node) => node.name === "Projects");
    expect(projects?.kind).toBe("folder");
    const alpha = projects?.children?.[0];
    expect(alpha?.name).toBe("Alpha");
    expect(alpha?.children?.[0]).toMatchObject({
      name: "Notes.md",
      kind: "file",
      isMarkdown: true,
      path: "Projects/Alpha/Notes.md"
    });
  });

  it("includes empty directories from explicit directory entries", () => {
    const tree = buildFileTree([dirEntry("Archive"), fileEntry("Inbox.md")]);

    const archive = tree.find((node) => node.name === "Archive");
    expect(archive?.kind).toBe("folder");
    expect(archive?.children).toEqual([]);
  });

  it("includes non-markdown files and flags them as not markdown", () => {
    const tree = buildFileTree([fileEntry("image.png"), fileEntry("note.md")]);

    const image = tree.find((node) => node.name === "image.png");
    expect(image).toMatchObject({ kind: "file", isMarkdown: false });
    const note = tree.find((node) => node.name === "note.md");
    expect(note?.isMarkdown).toBe(true);
  });

  it("orders folders before files, each alphabetically (case-insensitive)", () => {
    const tree = buildFileTree([
      fileEntry("zebra.md"),
      fileEntry("Apple.md"),
      dirEntry("beta"),
      fileEntry("beta/inner.md"),
      dirEntry("Alpha"),
      fileEntry("Alpha/inner.md")
    ]);

    expect(childNames(tree)).toEqual(["Alpha", "beta", "Apple.md", "zebra.md"]);
  });

  it("gives folders and files stable, distinct ids", () => {
    const tree = buildFileTree([dirEntry("docs"), fileEntry("docs/guide.md")]);

    expect(tree[0]?.id).toBe("folder:docs");
    expect(tree[0]?.children?.[0]?.id).toBe("docs/guide.md");
  });

  it("returns an empty tree for no entries", () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it("reuses a shared folder for sibling files", () => {
    const tree = buildFileTree([
      fileEntry("notes/a.md"),
      fileEntry("notes/b.txt")
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toHaveLength(2);
    expect(childNames(tree[0]?.children ?? [])).toEqual(["a.md", "b.txt"]);
  });
});
