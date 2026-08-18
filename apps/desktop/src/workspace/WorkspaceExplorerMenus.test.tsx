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

const render = async (target: ContextMenuTarget, showVersions = vi.fn()) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <WorkspaceContextMenu menu={{ x: 10, y: 10, target }} actions={stubActions({ showVersions })} />
    )
  );
  return { host: container, onShowVersions: showVersions };
};

const item = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("[role='menuitem']")].find((button) =>
    button.textContent?.includes(text)
  );

describe("asking a note for its earlier versions", () => {
  it("is offered on a file, and names the file it was asked about", async () => {
    const { host, onShowVersions } = await render({ kind: "file", entry: entry("file") });

    const button = item(host, "Previous versions");
    expect(button).toBeTruthy();
    await act(async () => button?.click());

    expect(onShowVersions).toHaveBeenCalledWith(entry("file"));
  });

  /// A folder has no versions of its own — its notes each have their own, and
  /// offering the folder one would be offering to restore all of them at once.
  it("is not offered on a folder", async () => {
    const { host } = await render({ kind: "folder", entry: entry("directory") });

    expect(item(host, "Previous versions")).toBeUndefined();
  });

  it("is not offered on empty space", async () => {
    const { host } = await render({ kind: "background" });

    expect(item(host, "Previous versions")).toBeUndefined();
  });
});
