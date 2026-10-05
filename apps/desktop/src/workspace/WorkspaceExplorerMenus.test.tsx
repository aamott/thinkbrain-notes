// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NativeWorkspaceEntry } from "../native/commands";
import { WorkspaceContextMenu } from "./WorkspaceExplorerMenus";
import type { ContextMenuTarget, WorkspaceExplorerActions } from "./workspaceExplorerTypes";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const entry = (kind: "file" | "directory"): NativeWorkspaceEntry => ({
  relative_path: kind === "file" ? "journal/Meeting Notes.md" : "journal",
  name: kind === "file" ? "Meeting Notes.md" : "journal",
  parent_path: kind === "file" ? "journal" : "",
  kind,
  is_markdown: kind === "file",
  byte_size: 120,
  updated_at: null
});

/**
 * Every action, doing nothing, so a test can name only the one it is about.
 *
 * A Proxy rather than a written-out object: the menu reads whichever members it
 * needs, and a stub list would be one more place to edit when an action is
 * added — which is the plumbing this shape exists to remove.
 */
const stubActions = (over: Partial<WorkspaceExplorerActions> = {}): WorkspaceExplorerActions =>
  new Proxy(over, {
    get: (target, name) => Reflect.get(target, name) ?? (() => undefined)
  }) as WorkspaceExplorerActions;

const render = async (
  target: ContextMenuTarget,
  over: Partial<WorkspaceExplorerActions> = {}
) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <WorkspaceContextMenu
        menu={{ x: 10, y: 10, target }}
        actions={stubActions(over)}
        rootPath="/vault"
      />
    )
  );
  return over;
};

const items = () =>
  [...document.querySelectorAll<HTMLButtonElement>("[role='menuitem']")].map(
    (button) => button.textContent
  );

// Pointer-placed menus portal to document.body, so items are found there
// rather than inside the render host.
const item = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("[role='menuitem']")].find((button) =>
    button.textContent?.includes(text)
  );

describe("asking a note for its earlier versions", () => {
  it("is offered on a file, and names the file it was asked about", async () => {
    const over = await render({ kind: "file", entry: entry("file") }, { showVersions: vi.fn() });

    const button = item("Previous versions");
    expect(button).toBeTruthy();
    await act(async () => button?.click());

    expect(over.showVersions).toHaveBeenCalledWith(entry("file"));
  });

  /// A folder has no versions of its own — its notes each have their own, and
  /// offering the folder one would be offering to restore all of them at once.
  it("is not offered on a folder", async () => {
    await render({ kind: "folder", entry: entry("directory") });

    expect(item("Previous versions")).toBeUndefined();
  });

  it("is not offered on empty space", async () => {
    await render({ kind: "background" });

    expect(item("Previous versions")).toBeUndefined();
  });
});

describe("creating entries from a right-click", () => {
  /// A file's menu needs the same creates a folder's has — the entries land in
  /// the file's parent — so right-clicking a note is never a dead end.
  it("offers New file and New folder on a file, creating beside it", async () => {
    const over = await render({ kind: "file", entry: entry("file") }, { startCreate: vi.fn() });

    await act(async () => item("New file")?.click());
    expect(over.startCreate).toHaveBeenCalledWith("journal", "file");

    await act(async () => item("New folder")?.click());
    expect(over.startCreate).toHaveBeenCalledWith("journal", "folder");
  });

  it("creates inside a folder when the folder is the target", async () => {
    const over = await render({ kind: "folder", entry: entry("directory") }, { startCreate: vi.fn() });

    await act(async () => item("New file")?.click());
    expect(over.startCreate).toHaveBeenCalledWith("journal", "file");
  });
});

describe("copying a target's handles", () => {
  it("offers name, both paths, and a file copy on a file", async () => {
    await render({ kind: "file", entry: entry("file") });

    for (const label of ["Copy name", "Copy relative path", "Copy absolute path", "Copy file"]) {
      expect(item(label), label).toBeTruthy();
    }
  });

  it("offers the same copies on a folder, named for a folder", async () => {
    await render({ kind: "folder", entry: entry("directory") });

    expect(item("Copy name")).toBeTruthy();
    expect(item("Copy relative path")).toBeTruthy();
    expect(item("Copy absolute path")).toBeTruthy();
    expect(item("Copy folder")).toBeTruthy();
  });

  it("drops the absolute copies when no workspace root is known", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root?.render(
        <WorkspaceContextMenu
          menu={{ x: 10, y: 10, target: { kind: "file", entry: entry("file") } }}
          actions={stubActions()}
          rootPath={null}
        />
      )
    );

    expect(item("Copy absolute path")).toBeUndefined();
    expect(item("Copy file")).toBeUndefined();
    expect(item("Copy name")).toBeTruthy();
  });
});

describe("the general tail", () => {
  /// Entry targets get the whole menu — file actions, then the workspace-wide
  /// ones after their own separator — so right-click is a superset, not a swap.
  it("follows file actions on every entry target", async () => {
    await render({ kind: "file", entry: entry("file") });

    const labels = items();
    expect(labels.indexOf("Delete")).toBeGreaterThan(-1);
    expect(labels.indexOf("Refresh")).toBeGreaterThan(labels.indexOf("Delete"));
    expect(labels.indexOf("Open workspace…")).toBeGreaterThan(labels.indexOf("Delete"));
  });

  it("is all the background menu has besides creates", async () => {
    await render({ kind: "background" });

    const labels = items();
    expect(labels).toEqual(["New file", "New folder", "Refresh", "Open workspace…"]);
  });
});
