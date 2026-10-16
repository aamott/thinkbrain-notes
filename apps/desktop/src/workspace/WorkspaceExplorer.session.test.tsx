// @vitest-environment happy-dom
/**
 * The explorer is a consumer of the workspace session, not its loader: it
 * shows what the session opened, and it drops its own transient UI when the
 * session moves to another root.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NativeWorkspaceEntry } from "../native/commands";
import { WorkspaceExplorer } from "./WorkspaceExplorer";
import { WorkspaceSwitchingHarness } from "./workspaceSwitching.testHarness";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";
import { WORKSPACE_TREE_ROW_ATTR } from "./useWorkspaceTreeDrag";

vi.mock("./workspaceSettings", () => ({
  DEFAULT_WORKSPACE_SETTINGS: { showHidden: false },
  readWorkspaceSettings: vi.fn(() => Promise.resolve({ showHidden: false })),
  writeWorkspaceSettings: vi.fn(() => Promise.resolve()),
  isWorkspaceGitLinked: vi.fn(() => Promise.resolve(false))
}));

const entry = (name: string): NativeWorkspaceEntry => ({
  relative_path: name,
  name,
  parent_path: "",
  kind: "file",
  is_markdown: true,
  byte_size: 0,
  updated_at: null
});

/** What the shell's session loads with: one note per vault, named after it. */
const sessionApi: WorkspaceDesktopApi = {
  ...workspaceDesktopApi,
  workspaceAccessCapabilities: async () => ({
    canOpenFolder: true,
    canCreateManagedWorkspace: false,
    opensWorkspaceInNewWindow: true
  }),
  listKnownWorkspaces: async () => [],
  openWorkspace: async (rootPath) => ({ workspace: { root_path: rootPath, name: rootPath.slice(1) }, files: [] }),
  listWorkspaceEntries: async (rootPath) => [entry(`${rootPath.slice(1)}.md`)]
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function render(workspacePath: string, explorer: ReactNode): Promise<HTMLDivElement> {
  container ??= document.body.appendChild(document.createElement("div"));
  root ??= createRoot(container);
  await act(async () => {
    root?.render(
      <WorkspaceSwitchingHarness api={sessionApi} initialWorkspacePath={workspacePath}>
        {() => explorer}
      </WorkspaceSwitchingHarness>
    );
  });
  await act(async () => undefined);
  return container;
}

const rows = (host: HTMLElement) =>
  [...host.querySelectorAll(`[${WORKSPACE_TREE_ROW_ATTR}]`)].map((row) => row.getAttribute(WORKSPACE_TREE_ROW_ATTR));

describe("WorkspaceExplorer over the workspace session", () => {
  it("shows what the session opened without opening anything itself", async () => {
    const openWorkspace = vi.fn(sessionApi.openWorkspace);
    const listWorkspaceEntries = vi.fn(sessionApi.listWorkspaceEntries);
    const explorerApi = { ...sessionApi, openWorkspace, listWorkspaceEntries };

    const host = await render("/vault", <WorkspaceExplorer api={explorerApi} />);

    expect(rows(host)).toEqual(["vault.md"]);
    expect(openWorkspace).not.toHaveBeenCalled();
    expect(listWorkspaceEntries).not.toHaveBeenCalled();
  });

  it("drops a pending delete when the session switches to another root", async () => {
    const host = await render("/vault", <WorkspaceExplorer api={sessionApi} />);
    const row = host.querySelector(`[${WORKSPACE_TREE_ROW_ATTR}="vault.md"]`);
    await act(async () => {
      row?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    const deleteItem = [...document.querySelectorAll<HTMLButtonElement>("[role='menuitem']")].find((button) =>
      button.textContent?.includes("Delete")
    );
    await act(async () => deleteItem?.click());
    expect(document.querySelector("[role='dialog']")).not.toBeNull();

    await render("/other", <WorkspaceExplorer api={sessionApi} />);

    expect(rows(host)).toEqual(["other.md"]);
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });
});
