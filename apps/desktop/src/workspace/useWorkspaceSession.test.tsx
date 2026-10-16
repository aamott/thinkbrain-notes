// @vitest-environment happy-dom
/**
 * The window's one workspace session: which root is open, how far opening has
 * got, and what it found. These are the races the explorer used to settle on
 * its own — a switch while the previous open is still in flight, a restore
 * that fails, a listing that lands after the user has moved on.
 */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";
import { DEFAULT_EXPLORER_SORT } from "./explorerSort";
import { useWorkspaceSession, type UseWorkspaceSessionOptions } from "./useWorkspaceSession";
import type { WorkspaceSession } from "./workspaceSession";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";
import { readWorkspaceSettings } from "./workspaceSettings";

vi.mock("./workspaceSettings", () => ({
  DEFAULT_WORKSPACE_SETTINGS: { showHidden: false, explorerSort: "name-asc" },
  readWorkspaceSettings: vi.fn(() => Promise.resolve({ showHidden: false, explorerSort: "name-asc" }))
}));

const snapshot = (rootPath: string): NativeWorkspaceSnapshot => ({
  workspace: { root_path: rootPath, name: rootPath.split("/").at(-1) ?? rootPath },
  files: [{ relative_path: `${rootPath.slice(1)}.md`, file_name: `${rootPath.slice(1)}.md`, parent_path: "", byte_size: 1, updated_at: null }]
});

const entry = (name: string): NativeWorkspaceEntry => ({
  relative_path: name,
  name,
  parent_path: "",
  kind: "file",
  is_markdown: true,
  byte_size: 1,
  updated_at: null
});

/** A promise the test resolves or rejects when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let session: WorkspaceSession | null = null;

const current = (): WorkspaceSession => {
  if (!session) throw new Error("the session did not render");
  return session;
};

function Probe(options: UseWorkspaceSessionOptions) {
  const value = useWorkspaceSession(options);
  useEffect(() => {
    session = value;
  });
  return null;
}

async function render(api: Partial<WorkspaceDesktopApi>, options: Omit<UseWorkspaceSessionOptions, "api"> = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const resolved: WorkspaceDesktopApi = {
    ...workspaceDesktopApi,
    openWorkspace: async (rootPath) => snapshot(rootPath),
    listWorkspaceEntries: async (rootPath) => [entry(`${rootPath.slice(1)}.md`)],
    ...api
  };
  await act(async () => {
    root?.render(<Probe api={resolved} {...options} />);
  });
}

beforeEach(() => {
  vi.mocked(readWorkspaceSettings).mockReset();
  vi.mocked(readWorkspaceSettings).mockResolvedValue({ showHidden: false, explorerSort: "name-asc" });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  session = null;
});

describe("useWorkspaceSession", () => {
  it("opens a root: settings first, then the snapshot, then the listing", async () => {
    vi.mocked(readWorkspaceSettings).mockResolvedValue({ showHidden: true, explorerSort: "name-desc" });
    const listWorkspaceEntries = vi.fn(async () => [entry("a.md")]);
    const onOpened = vi.fn();
    await render({ listWorkspaceEntries }, { onOpened });

    await act(async () => {
      await current().open("/vault");
    });

    expect(current()).toMatchObject({
      phase: "ready",
      rootPath: "/vault",
      showHidden: true,
      explorerSort: "name-desc",
      error: null
    });
    expect(current().entries.map((item) => item.relative_path)).toEqual(["a.md"]);
    expect(current().files).toEqual(snapshot("/vault").files);
    expect(listWorkspaceEntries).toHaveBeenCalledWith("/vault", true);
    expect(onOpened).toHaveBeenCalledWith("/vault", snapshot("/vault"));
  });

  it("names the new root at once, before any of the open has resolved", async () => {
    const opening = deferred<NativeWorkspaceSnapshot>();
    await render({ openWorkspace: () => opening.promise });

    let pending: Promise<void> | undefined;
    act(() => {
      pending = current().open("/vault");
    });

    expect(current().rootRef.current).toBe("/vault");
    await act(async () => undefined);
    expect(current().phase).toBe("opening");
    expect(current().rootPath).toBe("/vault");

    await act(async () => {
      opening.resolve(snapshot("/vault"));
      await pending;
    });
    expect(current().phase).toBe("ready");
  });

  it("lets a later switch win over an earlier open still in flight", async () => {
    const first = deferred<NativeWorkspaceSnapshot>();
    const onOpened = vi.fn();
    await render(
      { openWorkspace: (rootPath) => (rootPath === "/first" ? first.promise : Promise.resolve(snapshot(rootPath))) },
      { onOpened }
    );

    let stale: Promise<void> | undefined;
    await act(async () => {
      stale = current().open("/first");
    });
    await act(async () => {
      await current().open("/second");
    });
    await act(async () => {
      first.resolve(snapshot("/first"));
      await stale;
    });

    expect(current().rootPath).toBe("/second");
    expect(current().snapshot?.workspace.root_path).toBe("/second");
    expect(current().files).toEqual(snapshot("/second").files);
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(onOpened).toHaveBeenCalledWith("/second", snapshot("/second"));
  });

  it("gives up the root when it cannot be opened, and says so once", async () => {
    const onUnavailable = vi.fn();
    await render(
      { openWorkspace: () => Promise.reject(new Error("The folder is gone.")) },
      { onUnavailable }
    );

    await act(async () => {
      await current().open("/gone");
    });

    expect(current()).toMatchObject({ phase: "error", rootPath: null, error: "The folder is gone." });
    expect(current().rootRef.current).toBeNull();
    expect(current().files).toEqual([]);
    expect(onUnavailable).toHaveBeenCalledWith("/gone");
  });

  it("ignores the failure of an open the user already switched away from", async () => {
    const first = deferred<NativeWorkspaceSnapshot>();
    const onUnavailable = vi.fn();
    await render(
      { openWorkspace: (rootPath) => (rootPath === "/first" ? first.promise : Promise.resolve(snapshot(rootPath))) },
      { onUnavailable }
    );

    let stale: Promise<void> | undefined;
    await act(async () => {
      stale = current().open("/first");
    });
    await act(async () => {
      await current().open("/second");
    });
    await act(async () => {
      first.reject(new Error("too late"));
      await stale;
    });

    expect(current()).toMatchObject({ phase: "ready", rootPath: "/second", error: null });
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("does not apply a listing for a root the user has left", async () => {
    const listing = deferred<readonly NativeWorkspaceEntry[]>();
    let deferNext = false;
    await render({
      listWorkspaceEntries: (rootPath) =>
        deferNext && rootPath === "/first" ? listing.promise : Promise.resolve([entry(`${rootPath.slice(1)}.md`)])
    });
    await act(async () => {
      await current().open("/first");
    });

    deferNext = true;
    let refreshed: Promise<boolean> | undefined;
    await act(async () => {
      refreshed = current().refreshEntries("/first");
    });
    await act(async () => {
      await current().open("/second");
    });
    await act(async () => {
      listing.resolve([entry("stale.md")]);
    });

    await expect(refreshed).resolves.toBe(false);
    expect(current().entries.map((item) => item.relative_path)).toEqual(["second.md"]);
  });

  it("starts a new root from default view settings when its own cannot be read", async () => {
    vi.mocked(readWorkspaceSettings).mockResolvedValueOnce({ showHidden: true, explorerSort: "name-desc" });
    const listWorkspaceEntries = vi.fn(async () => [entry("a.md")]);
    await render({ listWorkspaceEntries });
    await act(async () => {
      await current().open("/first");
    });
    expect(current().showHidden).toBe(true);

    vi.mocked(readWorkspaceSettings).mockRejectedValueOnce(new Error("unreadable"));
    await act(async () => {
      await current().open("/second");
    });

    expect(current().showHidden).toBe(false);
    expect(current().explorerSort).toBe(DEFAULT_EXPLORER_SORT);
    expect(listWorkspaceEntries).toHaveBeenLastCalledWith("/second", false);
  });
});
