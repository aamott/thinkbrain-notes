import { describe, expect, it } from "vitest";

import type { NativeWorkspaceEntry } from "../native/commands";
import {
  buildWorkspaceTree,
  type WorkspaceTreeNode
} from "./workspaceExplorerModel";
import {
  DEFAULT_EXPLORER_SORT,
  EXPLORER_SORT_OPTIONS,
  isExplorerSortOrder,
  sortWorkspaceTree,
  type ExplorerSortOrder
} from "./explorerSort";

const file = (
  path: string,
  times: { updated_at?: number | null; created_at?: number | null } = {}
): NativeWorkspaceEntry => ({
  relative_path: path,
  name: path.split("/").at(-1) ?? path,
  parent_path: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
  kind: "file",
  is_markdown: path.endsWith(".md"),
  byte_size: 1,
  updated_at: times.updated_at ?? null,
  created_at: times.created_at ?? null
});

const dir = (path: string, parent = ""): NativeWorkspaceEntry => ({
  relative_path: parent ? `${parent}/${path}` : path,
  name: path,
  parent_path: parent,
  kind: "directory",
  is_markdown: false,
  byte_size: 0,
  updated_at: null,
  created_at: null
});

const pathsOf = (nodes: readonly WorkspaceTreeNode[]): string[] =>
  nodes.map((node) => node.entry.relative_path);

const orders = EXPLORER_SORT_OPTIONS.map((option) => option.id);

describe("explorerSort", () => {
  it("offers every order with modified-desc as the default", () => {
    expect(orders).toEqual([
      "modified-desc",
      "name-asc",
      "name-desc",
      "created-desc",
      "created-asc",
      "type"
    ]);
    expect(DEFAULT_EXPLORER_SORT).toBe("modified-desc");
  });

  it("recognizes only real order ids", () => {
    expect(isExplorerSortOrder("name-asc")).toBe(true);
    expect(isExplorerSortOrder("type")).toBe(true);
    expect(isExplorerSortOrder("size")).toBe(false);
    expect(isExplorerSortOrder(42)).toBe(false);
    expect(isExplorerSortOrder(null)).toBe(false);
  });

  it.each(orders)("keeps folders before files under %s", (order: ExplorerSortOrder) => {
    const tree = buildWorkspaceTree([file("aaa.md"), dir("zzz"), file("bbb.md")], order);
    expect(tree[0]?.entry.relative_path).toBe("zzz");
    expect(tree[0]?.entry.kind).toBe("directory");
  });

  it("sorts names case-insensitively and numerically — note2 before note10", () => {
    const tree = buildWorkspaceTree(
      [file("Note10.md"), file("note2.md"), file("note1.md")],
      "name-asc"
    );
    expect(pathsOf(tree)).toEqual(["note1.md", "note2.md", "Note10.md"]);
  });

  it("reverses names under name-desc", () => {
    const tree = buildWorkspaceTree([file("a.md"), file("c.md"), file("b.md")], "name-desc");
    expect(pathsOf(tree)).toEqual(["c.md", "b.md", "a.md"]);
  });

  it("orders by updated_at under modified-desc, untimed files last", () => {
    const tree = buildWorkspaceTree(
      [
        file("old.md", { updated_at: 100 }),
        file("untimed.md"),
        file("new.md", { updated_at: 300 }),
        file("mid.md", { updated_at: 200 })
      ],
      "modified-desc"
    );
    expect(pathsOf(tree)).toEqual(["new.md", "mid.md", "old.md", "untimed.md"]);
  });

  it("orders by created_at under created-desc and created-asc", () => {
    const entries = [
      file("one.md", { created_at: 100 }),
      file("two.md", { created_at: 200 }),
      file("three.md", { created_at: 300 })
    ];
    expect(pathsOf(buildWorkspaceTree(entries, "created-desc"))).toEqual([
      "three.md",
      "two.md",
      "one.md"
    ]);
    expect(pathsOf(buildWorkspaceTree(entries, "created-asc"))).toEqual([
      "one.md",
      "two.md",
      "three.md"
    ]);
  });

  it("ranks a folder by its newest descendant file, not its own timestamp", () => {
    // `fresh/` holds a just-edited file; `stale/` holds an old one. Under
    // modified-desc the folder containing the freshest work sorts first even
    // though neither folder has a meaningful mtime of its own.
    const tree = buildWorkspaceTree(
      [
        dir("stale"),
        dir("fresh"),
        file("stale/old.md", { updated_at: 100 }),
        file("fresh/new.md", { updated_at: 900 })
      ],
      "modified-desc"
    );
    expect(pathsOf(tree)).toEqual(["fresh", "stale"]);
    expect(pathsOf(tree[0]!.children)).toEqual(["fresh/new.md"]);
  });

  it("groups files by extension under type, extensionless files last", () => {
    const tree = buildWorkspaceTree(
      [file("b.md"), file("a.txt"), file("noext"), file("c.md"), file(".hidden")],
      "type"
    );
    expect(pathsOf(tree)).toEqual(["b.md", "c.md", "a.txt", ".hidden", "noext"]);
  });

  it("sorts inside folders too, returning new node objects without mutating the input", () => {
    const input = buildWorkspaceTree(
      [dir("d"), file("d/b.md"), file("d/a.md"), file("z.md"), file("a.md")],
      "name-asc"
    );
    const originalRoots = [...input];
    const originalChildren = [...(input[0]?.children ?? [])];

    const sorted = sortWorkspaceTree(input, "name-desc");

    expect(pathsOf(sorted)).toEqual(["d", "z.md", "a.md"]);
    expect(pathsOf(sorted[0]!.children)).toEqual(["d/b.md", "d/a.md"]);
    // Input untouched: same roots in the same order, same child array.
    expect([...input]).toEqual(originalRoots);
    expect(input[0]?.children).toEqual(originalChildren);
    expect(sorted[0]).not.toBe(input[0]);
  });
});
