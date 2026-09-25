// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";
import { WorkspaceExplorer } from "./WorkspaceExplorer";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";
import {
  WORKSPACE_DRAG_HANDLE_ATTR,
  WORKSPACE_DRAG_PREVIEW_ATTR,
  WORKSPACE_DROP_PARENT_ATTR,
  WORKSPACE_TOUCH_DRAG_HOLD_MS,
  WORKSPACE_TREE_ROW_ATTR
} from "./useWorkspaceTreeDrag";

vi.mock("./workspaceSettings", () => ({
  DEFAULT_WORKSPACE_SETTINGS: { showHidden: false },
  readWorkspaceSettings: vi.fn(() => Promise.resolve({ showHidden: false })),
  writeWorkspaceSettings: vi.fn(() => Promise.resolve()),
  isWorkspaceGitLinked: vi.fn(() => Promise.resolve(false))
}));

vi.mock("./gitLinkImport", () => ({
  previewWorkspaceFromGitLink: vi.fn(),
  importWorkspaceFromGitLink: vi.fn(),
  subscribeToWorkspaceImport: vi.fn(() => Promise.resolve(() => undefined))
}));

const SNAPSHOT: NativeWorkspaceSnapshot = {
  workspace: { root_path: "/vault", name: "vault" },
  files: []
};

const entry = (relativePath: string, kind: "file" | "directory" = "file"): NativeWorkspaceEntry => ({
  relative_path: relativePath,
  name: relativePath.split("/").at(-1) ?? relativePath,
  parent_path: relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "",
  kind,
  is_markdown: kind === "file" && /\.(md|markdown)$/i.test(relativePath),
  byte_size: 0,
  updated_at: null
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface Fixture {
  api: WorkspaceDesktopApi;
  renameWorkspaceEntry: ReturnType<typeof vi.fn>;
  listWorkspaceEntries: ReturnType<typeof vi.fn>;
}

const explorerApi = (entries: readonly NativeWorkspaceEntry[]): Fixture => {
  const renameWorkspaceEntry = vi.fn(async () => entry("moved.md"));
  const listWorkspaceEntries = vi.fn(async () => entries);
  const api: WorkspaceDesktopApi = {
    ...workspaceDesktopApi,
    workspaceAccessCapabilities: async () => ({
      canOpenFolder: true,
      canCreateManagedWorkspace: false,
      opensWorkspaceInNewWindow: true
    }),
    openWorkspace: async () => SNAPSHOT,
    listWorkspaceEntries,
    renameWorkspaceEntry
  };
  return { api, renameWorkspaceEntry, listWorkspaceEntries };
};

async function renderExplorer(fixture: Fixture, props: Record<string, unknown> = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <WorkspaceExplorer api={fixture.api} initialWorkspacePath="/vault" {...props} />
    );
  });
  await act(async () => undefined);
  return container!;
}

function handleOf(name: string): HTMLElement {
  const handle = container?.querySelector<HTMLElement>(`button[aria-label^="Move ${name}"]`);
  if (!handle) throw new Error(`drag handle for ${name} not found`);
  return handle;
}

async function key(element: Element, keyName: string) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true }));
  });
}

function touch(type: string, x: number, y: number): Event {
  const point = { identifier: 3, clientX: x, clientY: y };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { touches: [point], changedTouches: [point] });
  return event;
}

function liveText(): string {
  return container?.querySelector("[aria-live='polite']")?.textContent ?? "";
}

const TREE_ENTRIES = [entry("Folder", "directory"), entry("a.md"), entry("Target", "directory")];

describe("workspace explorer moves", () => {
  it("moves a file into a folder through the keyboard handle and refreshes once", async () => {
    const fixture = explorerApi(TREE_ENTRIES);
    await renderExplorer(fixture);

    const handle = handleOf("a.md");
    await key(handle, "Enter");
    expect(liveText()).toContain("Picked up a.md");
    // Root is a.md's parent, so the cycle starts at Folder.
    expect(liveText()).toContain("Destination: Folder");

    await key(handle, "Enter");
    expect(fixture.renameWorkspaceEntry).toHaveBeenCalledWith("/vault", "a.md", "Folder/a.md");
    // One listing at open, one refresh for the move.
    expect(fixture.listWorkspaceEntries).toHaveBeenCalledTimes(2);
    expect(liveText()).toContain("Moved a.md to Folder/a.md");
  });

  it("moves a file after a whole-row touch hold and follows the finger", async () => {
    vi.useFakeTimers();
    const fixture = explorerApi(TREE_ENTRIES);
    await renderExplorer(fixture);
    const row = container!.querySelector<HTMLElement>(
      `[${WORKSPACE_TREE_ROW_ATTR}="a.md"] > button`
    )!;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(
      container!.querySelector(`[${WORKSPACE_DROP_PARENT_ATTR}="Target"]`)!
    );

    await act(async () => {
      row.dispatchEvent(touch("touchstart", 20, 20));
      vi.advanceTimersByTime(WORKSPACE_TOUCH_DRAG_HOLD_MS);
    });
    expect(document.body.querySelector(`[${WORKSPACE_DRAG_PREVIEW_ATTR}]`)?.textContent).toContain("a.md");
    await act(async () => {
      row.dispatchEvent(touch("touchmove", 34, 42));
      row.dispatchEvent(touch("touchend", 34, 42));
    });

    expect(fixture.renameWorkspaceEntry).toHaveBeenCalledWith("/vault", "a.md", "Target/a.md");
    expect(liveText()).toContain("Moved a.md to Target/a.md");
  });

  it("remaps the active row and expanded folders when a folder moves", async () => {
    const fixture = explorerApi(TREE_ENTRIES);
    // After the Folder → Target/Folder move the refresh returns the new tree.
    fixture.listWorkspaceEntries
      .mockReturnValueOnce(Promise.resolve(TREE_ENTRIES))
      .mockReturnValue(Promise.resolve([
        entry("a.md"),
        entry("Target", "directory"),
        entry("Target/Folder", "directory"),
        entry("Target/Folder/inner.md")
      ]));
    await renderExplorer(fixture);

    // Expand Target first (its children only render while it is open), then
    // Folder, which ends as the active row.
    const targetRow = container!.querySelector<HTMLElement>(
      `[${WORKSPACE_TREE_ROW_ATTR}="Target"] > button`
    )!;
    await act(async () => {
      targetRow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    const folderRow = container!.querySelector<HTMLElement>(
      `[${WORKSPACE_TREE_ROW_ATTR}="Folder"] > button`
    )!;
    await act(async () => {
      folderRow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    // Pick Folder up with the keyboard. Its only valid destination is Target:
    // the root is its current parent and itself is excluded.
    const handle = handleOf("Folder");
    await key(handle, "Enter");
    expect(liveText()).toContain("Destination: Target");
    await key(handle, "Enter");

    expect(fixture.renameWorkspaceEntry).toHaveBeenCalledWith("/vault", "Folder", "Target/Folder");
    await act(async () => undefined);
    // The moved folder stayed expanded at its new path: its child row renders.
    const movedRow = container!.querySelector(`[${WORKSPACE_TREE_ROW_ATTR}="Target/Folder"]`);
    expect(movedRow).not.toBeNull();
    expect(movedRow?.closest("[role='treeitem']")?.getAttribute("aria-expanded")).toBe("true");
    // And the active row followed it.
    const activeRow = container!.querySelector("button[tabindex='0']");
    expect(movedRow?.contains(activeRow ?? null)).toBe(true);
  });

  it("expands a collapsed destination and focuses the moved row's handle", async () => {
    const fixture = explorerApi(TREE_ENTRIES);
    fixture.listWorkspaceEntries
      .mockReturnValueOnce(Promise.resolve(TREE_ENTRIES))
      .mockReturnValue(Promise.resolve([
        entry("Folder", "directory"),
        entry("Target", "directory"),
        entry("Target/a.md")
      ]));
    // Capture the focus callback so the frame runs deterministically.
    let frame: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 0;
    });
    await renderExplorer(fixture);

    // Keyboard move of a.md into Target — currently collapsed.
    const handle = handleOf("a.md");
    await key(handle, "Enter");
    await key(handle, "ArrowDown");
    await key(handle, "Enter");
    expect(fixture.renameWorkspaceEntry).toHaveBeenCalledWith("/vault", "a.md", "Target/a.md");
    await act(async () => undefined);

    // The destination expanded so the moved row stayed visible.
    const movedRow = container!.querySelector(`[${WORKSPACE_TREE_ROW_ATTR}="Target/a.md"]`);
    expect(movedRow).not.toBeNull();
    expect(movedRow?.querySelector(`[${WORKSPACE_DRAG_HANDLE_ATTR}]`)).not.toBeNull();

    // The next frame lands focus on the moved row's drag handle.
    expect(frame).not.toBeNull();
    await act(async () => {
      frame!(0 as DOMHighResTimeStamp);
    });
    const movedHandle = container!.querySelector<HTMLElement>(
      `button[${WORKSPACE_DRAG_HANDLE_ATTR}="Target/a.md"]`
    );
    expect(document.activeElement).toBe(movedHandle);
  });

  it("marks the root drop region invalid for a same-parent drop", async () => {
    const fixture = explorerApi(TREE_ENTRIES);
    await renderExplorer(fixture);

    const rootRegion = container!.querySelector<HTMLElement>("[data-workspace-drop-root]")!;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(rootRegion);
    const row = container!.querySelector<HTMLElement>(
      `[${WORKSPACE_TREE_ROW_ATTR}="a.md"] > button`
    )!;
    const pointer = (type: string, init: Record<string, unknown> = {}) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 1, button: 0, pointerType: "mouse", clientX: 0, clientY: 0, ...init });
      row.dispatchEvent(event);
    };
    await act(async () => {
      pointer("pointerdown");
      pointer("pointermove", { clientX: 30 });
    });
    // a.md already lives at the root: the region shows the invalid treatment.
    expect(rootRegion.className).toContain("destructive");
    expect(rootRegion.className).not.toContain("accent");
    await act(async () => pointer("pointercancel", { clientX: 30 }));
    expect(fixture.renameWorkspaceEntry).not.toHaveBeenCalled();
  });

  it("reports a drop onto a folder's own descendant without a native call", async () => {
    const fixture = explorerApi([
      entry("Folder", "directory"),
      entry("Folder/Sub", "directory"),
      entry("a.md")
    ]);
    await renderExplorer(fixture);

    // Expand Folder so its subfolder row exists in the tree.
    const folderRow = container!.querySelector<HTMLElement>(
      `[${WORKSPACE_TREE_ROW_ATTR}="Folder"] > button`
    )!;
    await act(async () => {
      folderRow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    // Drag Folder's row over its own subfolder and release.
    const row = container!.querySelector<HTMLElement>(
      `[${WORKSPACE_TREE_ROW_ATTR}="Folder"] > button`
    )!;
    const subTarget = container!.querySelector<HTMLElement>(
      `[${WORKSPACE_DROP_PARENT_ATTR}="Folder/Sub"]`
    )!;
    expect(subTarget).not.toBeNull();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(subTarget);

    const pointer = (type: string, init: Record<string, unknown> = {}) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 1, button: 0, pointerType: "mouse", clientX: 0, clientY: 0, ...init });
      row.dispatchEvent(event);
    };
    await act(async () => {
      pointer("pointerdown");
      pointer("pointermove", { clientX: 30 });
      pointer("pointerup", { clientX: 30 });
    });

    expect(fixture.renameWorkspaceEntry).not.toHaveBeenCalled();
    expect(liveText()).toContain("cannot be moved into itself");
  });

  it("does not mutate the new workspace when a move resolves after a switch", async () => {
    const fixture = explorerApi(TREE_ENTRIES);
    let resolveRename!: (value: NativeWorkspaceEntry) => void;
    fixture.renameWorkspaceEntry.mockReturnValueOnce(
      new Promise<NativeWorkspaceEntry>((resolve) => {
        resolveRename = resolve;
      })
    );
    const otherSnapshot: NativeWorkspaceSnapshot = {
      workspace: { root_path: "/vault2", name: "vault2" },
      files: []
    };
    fixture.api.openWorkspace = async (rootPath: string) =>
      rootPath === "/vault2" ? otherSnapshot : SNAPSHOT;
    fixture.listWorkspaceEntries.mockImplementation(async (rootPath: string) =>
      rootPath === "/vault2" ? [entry("other.md")] : TREE_ENTRIES
    );
    await renderExplorer(fixture);

    // Start a keyboard move in /vault and leave it in flight.
    const handle = handleOf("a.md");
    await key(handle, "Enter");
    await key(handle, "Enter");
    expect(fixture.renameWorkspaceEntry).toHaveBeenCalledWith("/vault", "a.md", "Folder/a.md");

    // Switch workspaces while the rename is still pending.
    await act(async () => {
      root?.render(
        <WorkspaceExplorer api={fixture.api} initialWorkspacePath="/vault2" />
      );
    });
    expect(container?.textContent).toContain("other.md");

    // The stale completion must not corrupt the new workspace's tree state.
    await act(async () => {
      resolveRename(entry("Folder/a.md"));
    });
    await act(async () => undefined);
    expect(container?.textContent).toContain("other.md");
    expect(container?.querySelector(`[${WORKSPACE_TREE_ROW_ATTR}]`)?.getAttribute(WORKSPACE_TREE_ROW_ATTR)).toBe("other.md");
  });

  it("surfaces a native failure as an action error and announces it", async () => {
    const fixture = explorerApi(TREE_ENTRIES);
    fixture.renameWorkspaceEntry.mockRejectedValueOnce(new Error("disk full"));
    await renderExplorer(fixture);

    const handle = handleOf("a.md");
    await key(handle, "Enter");
    await key(handle, "Enter");

    expect(fixture.renameWorkspaceEntry).toHaveBeenCalled();
    expect(liveText()).toContain("Could not move a.md");
    expect(container?.querySelector("[role='alert']")?.textContent).toContain("disk full");
  });
});
