// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeWorkspaceAccessCapabilities, NativeWorkspaceSnapshot } from "../native/commands";
import { WorkspaceExplorer, WorkspaceSelector } from "./WorkspaceExplorer";
import { WorkspaceFileIcon } from "./WorkspaceFileIcon";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";
import { readWorkspaceSettings, type WorkspaceSettings } from "./workspaceSettings";

vi.mock("./workspaceSettings", () => ({
  DEFAULT_WORKSPACE_SETTINGS: { showHidden: false },
  readWorkspaceSettings: vi.fn(() => Promise.resolve({ showHidden: false })),
  writeWorkspaceSettings: vi.fn(() => Promise.resolve()),
  isWorkspaceGitLinked: vi.fn((path: string) => Promise.resolve(path.includes("git-linked")))
}));

vi.mock("./gitLinkImport", () => ({
  previewWorkspaceFromGitLink: vi.fn(),
  importWorkspaceFromGitLink: vi.fn(),
  subscribeToWorkspaceImport: vi.fn(() => Promise.resolve(() => undefined))
}));

const desktopCapabilities: NativeWorkspaceAccessCapabilities = {
  canOpenFolder: true,
  canCreateManagedWorkspace: false,
  opensWorkspaceInNewWindow: true
};
const managedCapabilities: NativeWorkspaceAccessCapabilities = {
  canOpenFolder: false,
  canCreateManagedWorkspace: true,
  opensWorkspaceInNewWindow: false
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderSelector(capabilities = desktopCapabilities) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onSelect = vi.fn();
  const onAdd = vi.fn();
  const onCreateManaged = vi.fn();
  const onImportFromGit = vi.fn();

  await act(async () => {
    root?.render(
      <WorkspaceSelector
        capabilities={capabilities}
        currentPath="/notes/current"
        paths={["/notes/previous", "/notes/current"]}
        onSelect={onSelect}
        onAdd={onAdd}
        onCreateManaged={onCreateManaged}
        onImportFromGit={onImportFromGit}
      />
    );
  });

  return { onAdd, onCreateManaged, onImportFromGit, onSelect };
}

async function renderExplorer(
  api: WorkspaceDesktopApi,
  initialWorkspacePath?: string,
  capabilities = desktopCapabilities
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const resolvedApi = { ...api, workspaceAccessCapabilities: async () => capabilities };
  await act(async () => {
    root?.render(
      <WorkspaceExplorer
        api={resolvedApi}
        initialWorkspacePath={initialWorkspacePath}
        recentWorkspacePaths={["/notes/previous"]}
      />
    );
  });
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function typeInto(element: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("WorkspaceExplorer presentation", () => {
  it("maps common workspace file types to distinct Lucide icons", () => {
    const markup = ["note.md", "settings.json", "photo.png", "archive.zip", "unknown.bin"].map(iconMarkup);

    expect(markup[0]).toContain("lucide-file-text");
    expect(markup[4]).toContain("lucide-file");
    expect(new Set(markup).size).toBe(5);
  });

  it("uses a menu-shaped workspace selector that opens a new workspace without changing its source", async () => {
    const { onAdd, onSelect } = await renderSelector();
    const trigger = container?.querySelector<HTMLButtonElement>("button");
    if (!trigger) throw new Error("Workspace selector trigger was not rendered.");

    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await click(trigger);

    const menu = container?.querySelector("[role='menu']");
    expect(menu?.getAttribute("aria-label")).toBe("Workspaces");
    expect(menu?.querySelectorAll("[role='menuitem']")).toHaveLength(4);
    const previous = Array.from(menu?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("previous"));
    if (!previous) throw new Error("Known workspace was not rendered.");
    await click(previous);

    expect(onSelect).toHaveBeenCalledWith("/notes/previous");
    expect(container?.querySelector("[role='menu']")).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("closes the selector menu with Escape and exposes Open folder and Bring in from Git link", async () => {
    const { onAdd, onImportFromGit } = await renderSelector();
    const trigger = container?.querySelector<HTMLButtonElement>("button");
    if (!trigger) throw new Error("Workspace selector trigger was not rendered.");
    await click(trigger);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container?.querySelector("[role='menu']")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await click(trigger);
    const actions = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    expect(actions.at(-2)?.textContent).toContain("Open folder");
    expect(actions.at(-1)?.textContent).toContain("Bring in from Git link");
    await click(actions.at(-2)!);
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onImportFromGit).not.toHaveBeenCalled();

    await click(trigger);
    const again = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    await click(again.at(-1)!);
    expect(onImportFromGit).toHaveBeenCalledOnce();
    expect(container?.querySelector("[role='menu']")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("offers managed vault creation and Git import without Open folder on Android", async () => {
    const { onAdd, onCreateManaged, onImportFromGit } = await renderSelector(managedCapabilities);
    const trigger = container?.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']");
    if (!trigger) throw new Error("Workspace selector trigger was not rendered.");
    await click(trigger);

    const actions = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    expect(actions.some((button) => button.textContent?.includes("Open folder"))).toBe(false);
    const create = actions.find((button) => button.textContent?.includes("Create vault"));
    const clone = actions.find((button) => button.textContent?.includes("Bring in from Git link"));
    expect(create).toBeTruthy();
    expect(clone).toBeTruthy();

    await click(create!);
    expect(onCreateManaged).toHaveBeenCalledOnce();
    expect(onAdd).not.toHaveBeenCalled();
    await click(trigger);
    await click(Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])
      .find((button) => button.textContent?.includes("Bring in from Git link"))!);
    expect(onImportFromGit).toHaveBeenCalledOnce();
  });

  it("focuses the current workspace and supports menu keyboard navigation", async () => {
    await renderSelector();
    const trigger = container?.querySelector<HTMLButtonElement>("button");
    if (!trigger) throw new Error("Workspace selector trigger was not rendered.");
    await click(trigger);

    const items = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    expect(document.activeElement).toBe(items[0]);

    await act(async () => {
      items[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(items[1]);

    await act(async () => {
      items[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(container?.querySelector("[role='menu']")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("finishes loading an initial workspace after the opening render", async () => {
    let resolveSettings!: (settings: WorkspaceSettings) => void;
    vi.mocked(readWorkspaceSettings).mockReturnValueOnce(new Promise((resolve) => {
      resolveSettings = resolve;
    }));
    const snapshot: NativeWorkspaceSnapshot = {
      workspace: { root_path: "/notes/current", name: "current" },
      files: []
    };
    const openWorkspace = vi.fn(() => Promise.resolve(snapshot));
    const listWorkspaceEntries = vi.fn(() => Promise.resolve([]));
    const api = { ...workspaceDesktopApi, openWorkspace, listWorkspaceEntries };

    await renderExplorer(api, "/notes/current");
    expect(container?.textContent).toContain("Reading workspace entries");

    await act(async () => {
      resolveSettings({ showHidden: false });
      await Promise.resolve();
    });

    expect(openWorkspace).toHaveBeenCalledWith("/notes/current");
    expect(listWorkspaceEntries).toHaveBeenCalledWith("/notes/current", false);
    expect(container?.textContent).toContain("current");
    expect(container?.textContent).toContain("This workspace is empty");
  });

  it("routes recent and added workspaces through the window launch flow", async () => {
    const pickWorkspaceDirectory = vi.fn(() => Promise.resolve<string | null>("/notes/new"));
    const openWorkspaceWindow = vi.fn(() => Promise.resolve());
    const api = { ...workspaceDesktopApi, pickWorkspaceDirectory, openWorkspaceWindow };
    await renderExplorer(api);

    const trigger = container?.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']");
    if (!trigger) throw new Error("Workspace selector trigger was not rendered.");
    await click(trigger);
    const previous = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])
      .find((button) => button.textContent?.includes("previous"));
    if (!previous) throw new Error("Known workspace was not rendered.");
    await click(previous);
    expect(openWorkspaceWindow).toHaveBeenCalledWith("/notes/previous");

    await click(trigger);
    const actions = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    const openFolder = actions.find((button) => button.textContent?.includes("Open folder"));
    if (!openFolder) throw new Error("Open folder action was not rendered.");
    await click(openFolder);
    expect(pickWorkspaceDirectory).toHaveBeenCalledOnce();
    expect(openWorkspaceWindow).toHaveBeenCalledWith("/notes/new");
  });

  it("creates and opens a managed vault in the current window with a one-time storage notice", async () => {
    const descriptor = { root_path: "/app/vaults/Personal Notes", name: "Personal Notes" };
    const snapshot: NativeWorkspaceSnapshot = { workspace: descriptor, files: [] };
    const createManagedWorkspace = vi.fn(async () => descriptor);
    const openWorkspace = vi.fn(async () => snapshot);
    const openWorkspaceWindow = vi.fn(async () => undefined);
    const api = {
      ...workspaceDesktopApi,
      createManagedWorkspace,
      listManagedWorkspaces: vi.fn(async () => []),
      listWorkspaceEntries: vi.fn(async () => []),
      openWorkspace,
      openWorkspaceWindow
    };
    await renderExplorer(api, undefined, managedCapabilities);

    const trigger = container?.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']");
    if (!trigger) throw new Error("Workspace selector trigger was not rendered.");
    await click(trigger);
    const createAction = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])
      .find((button) => button.textContent?.includes("Create vault"));
    await click(createAction!);
    const input = container?.querySelector<HTMLInputElement>("[role='dialog'] input");
    if (!input) throw new Error("Managed workspace name input was not rendered.");
    await typeInto(input, "Personal Notes");
    await click(container!.querySelector<HTMLButtonElement>("[role='dialog'] button[type='submit']")!);
    await act(async () => undefined);

    expect(createManagedWorkspace).toHaveBeenCalledWith("Personal Notes");
    expect(openWorkspace).toHaveBeenCalledWith(descriptor.root_path);
    expect(openWorkspaceWindow).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("Android removes managed vaults");
    expect(container?.textContent).toContain("This workspace is empty");
  });

  it("distinguishes plain and Git-linked workspaces in the selector with accessible labels and icons", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <WorkspaceSelector
          capabilities={desktopCapabilities}
          currentPath="/notes/git-linked-vault"
          paths={["/notes/plain-notes", "/notes/git-linked-vault"]}
          onSelect={vi.fn()}
          onAdd={vi.fn()}
          onCreateManaged={vi.fn()}
          onImportFromGit={vi.fn()}
        />
      );
    });
    await act(async () => undefined);

    const trigger = container?.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']");
    expect(trigger?.getAttribute("aria-label")).toBe("git-linked-vault (Git-linked workspace)");
    expect(trigger?.querySelector(".lucide-folder-git2")).not.toBeNull();

    await click(trigger!);
    const items = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    const plainItem = items.find((item) => item.textContent?.includes("plain-notes"));
    const linkedItem = items.find((item) => item.textContent?.includes("git-linked-vault"));

    expect(plainItem?.getAttribute("aria-label")).toBe("plain-notes");
    expect(plainItem?.getAttribute("title")).toBe("/notes/plain-notes");
    expect(plainItem?.querySelector(".lucide-folder")).not.toBeNull();
    expect(plainItem?.querySelector(".lucide-folder-git2")).toBeNull();

    expect(linkedItem?.getAttribute("aria-label")).toBe("git-linked-vault (Git-linked workspace)");
    expect(linkedItem?.getAttribute("title")).toBe("/notes/git-linked-vault (Git-linked workspace)");
    expect(linkedItem?.querySelector(".lucide-folder-git2")).not.toBeNull();
  });

  it("still lets a workspace be chosen when the capability probe fails", async () => {
    // A host whose `workspace_access_capabilities` command is missing or simply
    // fails used to leave capabilities null forever — which the view reads as
    // "still checking", not "unknown": permanent placeholder copy and a
    // permanently disabled button, with no way to open a vault at all.
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const failing = {
      ...workspaceDesktopApi,
      workspaceAccessCapabilities: () => Promise.reject(new Error("no such command"))
    };
    await act(async () => {
      root?.render(<WorkspaceExplorer api={failing} recentWorkspacePaths={[]} />);
    });

    const choose = container.querySelector<HTMLButtonElement>('[aria-label="Choose workspace"]');
    expect(choose).not.toBeNull();
    expect(choose?.disabled).toBe(false);
  });
});

function iconMarkup(name: string) {
  return renderToStaticMarkup(<WorkspaceFileIcon name={name} />);
}
