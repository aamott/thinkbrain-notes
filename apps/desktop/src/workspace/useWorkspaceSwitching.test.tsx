// @vitest-environment happy-dom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeKnownWorkspace } from "../native/commands";
import { useNotificationStore } from "../notifications/notificationStore";
import { forgetWorkspace, saveDesktopState } from "../settings/desktopState";
import { useWorkspaceSwitching, type WorkspaceSwitchingController } from "./useWorkspaceSwitching";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true
}));

vi.mock("../settings/desktopState", () => ({
  forgetWorkspace: vi.fn(() => Promise.resolve({})),
  saveDesktopState: vi.fn(() => Promise.resolve({}))
}));

const knownWorkspaces: NativeKnownWorkspace[] = [
  { rootPath: "/notes/work", name: "Work", kind: "external", missing: false },
  { rootPath: "/vaults/Recipes", name: "Recipes", kind: "managed", missing: false }
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let controller: WorkspaceSwitchingController | null = null;
let openedInWindow: string[];

function Probe({
  api,
  onWorkspaceLaunched
}: {
  readonly api: WorkspaceDesktopApi;
  readonly onWorkspaceLaunched?: (rootPath: string) => void;
}) {
  const switching = useWorkspaceSwitching({
    api,
    openWorkspaceInWindow: (rootPath) => openedInWindow.push(rootPath),
    onWorkspaceLaunched
  });
  useEffect(() => {
    controller = switching;
  });
  return null;
}

async function render(
  api: Partial<WorkspaceDesktopApi> = {},
  onWorkspaceLaunched?: (rootPath: string) => void
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const resolved = {
    ...workspaceDesktopApi,
    workspaceAccessCapabilities: async () => ({
      canOpenFolder: true,
      canCreateManagedWorkspace: false,
      opensWorkspaceInNewWindow: true
    }),
    listKnownWorkspaces: async () => knownWorkspaces,
    ...api
  };
  await act(async () => {
    root?.render(<Probe api={resolved} onWorkspaceLaunched={onWorkspaceLaunched} />);
  });
  await act(async () => undefined);
}

beforeEach(() => {
  vi.mocked(forgetWorkspace).mockClear();
  vi.mocked(saveDesktopState).mockClear();
  useNotificationStore.getState().clearAll();
  openedInWindow = [];
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("useWorkspaceSwitching workspace list", () => {
  it("publishes the known-workspace list after it loads", async () => {
    await render();
    expect(controller?.knownWorkspaces).toEqual(knownWorkspaces);
  });

  it("forgetWorkspace drops the entry and offers an Undo notification", async () => {
    await render();
    await act(async () => controller?.forgetWorkspaceEntry("/notes/work"));

    expect(forgetWorkspace).toHaveBeenCalledWith("/notes/work");
    const note = useNotificationStore.getState().notifications.at(-1);
    expect(note?.source).toBe("workspaces");
    expect(note?.title).toBe("Removed from list");
    expect(note?.message).toContain("Work");
    expect(note?.severity).toBe("transient");
    expect(note?.action?.label).toBe("Undo");

    await act(async () => note?.action?.onClick());
    expect(saveDesktopState).toHaveBeenCalledWith({
      recentWorkspacePaths: ["/notes/work"]
    });
  });

  it("deletes a managed vault, forgets it, and reports success without undo", async () => {
    const deleteManagedWorkspace = vi.fn(async () => null);
    await render({ deleteManagedWorkspace });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await controller?.deleteManagedWorkspace("/vaults/Recipes");
    });

    expect(ok).toBe(true);
    expect(deleteManagedWorkspace).toHaveBeenCalledWith("/vaults/Recipes");
    expect(forgetWorkspace).toHaveBeenCalledWith("/vaults/Recipes");
    const note = useNotificationStore.getState().notifications.at(-1);
    expect(note?.variant).toBe("success");
    expect(note?.action).toBeUndefined();
  });

  it("returns false and leaves the error for the dialog when deletion fails", async () => {
    const deleteManagedWorkspace = vi.fn(async () => {
      throw new Error("Vault is busy");
    });
    await render({ deleteManagedWorkspace });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await controller?.deleteManagedWorkspace("/vaults/Recipes");
    });

    expect(ok).toBe(false);
    expect(controller?.manageWorkspacesError).toBe("Vault is busy");
    expect(forgetWorkspace).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});

describe("useWorkspaceSwitching launching", () => {
  const inWindow = {
    workspaceAccessCapabilities: async () => ({
      canOpenFolder: true,
      canCreateManagedWorkspace: false,
      opensWorkspaceInNewWindow: false
    })
  };

  it("launches in a new window when the host opens workspaces that way", async () => {
    const openWorkspaceWindow = vi.fn(async () => undefined);
    const onWorkspaceLaunched = vi.fn();
    await render({ openWorkspaceWindow }, onWorkspaceLaunched);

    await act(async () => controller?.launchWorkspace("/notes/work"));

    expect(openWorkspaceWindow).toHaveBeenCalledWith("/notes/work");
    expect(onWorkspaceLaunched).toHaveBeenCalledWith("/notes/work");
    expect(openedInWindow).toEqual([]);
  });

  it("opens in the same window via openWorkspaceInWindow when the host does not spawn windows", async () => {
    const openWorkspaceWindow = vi.fn(async () => undefined);
    const onWorkspaceLaunched = vi.fn();
    await render({ ...inWindow, openWorkspaceWindow }, onWorkspaceLaunched);

    await act(async () => controller?.launchWorkspace("/notes/work"));

    expect(openedInWindow).toEqual(["/notes/work"]);
    expect(openWorkspaceWindow).not.toHaveBeenCalled();
    expect(onWorkspaceLaunched).not.toHaveBeenCalled();
  });

  it("publishes a transient error notification when a launch fails", async () => {
    const openWorkspaceWindow = vi.fn(async () => {
      throw new Error("window refused");
    });
    await render({ openWorkspaceWindow });

    await act(async () => controller?.launchWorkspace("/notes/work"));

    const note = useNotificationStore.getState().notifications.at(-1);
    expect(note?.source).toBe("workspaces");
    expect(note?.variant).toBe("error");
    expect(note?.message).toContain("window refused");
  });
});

describe("useWorkspaceSwitching managed creation", () => {
  it("closes the dialog, opens the vault in-window, and shows the storage notice", async () => {
    const createManagedWorkspace = vi.fn(async () => ({
      root_path: "/app/vaults/Personal",
      name: "Personal"
    }));
    await render({ createManagedWorkspace });

    await act(async () => controller?.setCreateManagedWorkspaceOpen(true));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await controller?.createManagedWorkspace("Personal");
    });

    expect(ok).toBe(true);
    expect(createManagedWorkspace).toHaveBeenCalledWith("Personal");
    expect(controller?.createManagedWorkspaceOpen).toBe(false);
    expect(controller?.creatingManagedWorkspace).toBe(false);
    expect(controller?.createManagedWorkspaceError).toBeNull();
    expect(controller?.managedStorageNoticeOpen).toBe(true);
    expect(openedInWindow).toEqual(["/app/vaults/Personal"]);
  });

  it("keeps the failure in the dialog and clears the busy flag", async () => {
    const createManagedWorkspace = vi.fn(async () => {
      throw new Error("name already taken");
    });
    await render({ createManagedWorkspace });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await controller?.createManagedWorkspace("Personal");
    });

    expect(ok).toBe(false);
    expect(controller?.createManagedWorkspaceError).toBe("name already taken");
    expect(controller?.creatingManagedWorkspace).toBe(false);
    expect(openedInWindow).toEqual([]);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
